import logger from '../utils/logger';
import { create } from 'zustand';
import { extractInvoiceData } from '../services/vlmService';
import { compressImage } from '../utils/imageCompression';
import { cleanRut, formatRut } from '../utils/rutValidator';
import useInvoiceStore from './invoiceStore';
import db from '../services/storage/db';

/**
 * Cola de extracción de boletas, FUERA de los componentes.
 *
 * - Como store de Zustand (módulo singleton), la extracción continúa aunque
 *   el usuario cambie de página; UploadPage es solo una vista de la cola.
 * - Cada item se persiste en IndexedDB (tabla `uploadQueue`) con su Blob,
 *   los datos extraídos y las correcciones hechas en Revisión (`review`):
 *   cerrar la ventana o la sesión NO pierde el progreso. Al volver a abrir,
 *   la cola se rehidrata y las extracciones pendientes se reanudan solas.
 *
 * Manejo de volumen (100+ boletas):
 *   - Procesamiento secuencial (respeta el límite de ráfaga del backend).
 *   - Si el backend responde "demasiadas extracciones" (ráfaga), la cola
 *     espera y reintenta sola, sin marcar error.
 *   - Si se alcanza el límite mensual del plan, se detiene y marca los
 *     pendientes para no quemar reintentos inútiles.
 *   - Los errores puntuales quedan en la cola con botón de reintento.
 */

const BURST_WAIT_MS = 45_000;
const MAX_BURST_WAITS = 5;

// Límite de ráfaga por minuto. Cubre tanto el mensaje de nuestro backend
// como el error crudo del proveedor (Gemini/OpenAI): "exceeded your current
// quota", "rate limit", "resource exhausted", HTTP 429.
const isBurstLimitError = (err) =>
  /demasiadas extracciones|exceeded your current quota|rate.?limit|resource has been exhausted|too many requests|\b429\b/i.test(
    err?.message || ''
  );

const isMonthlyLimitError = (err) => /límite mensual/i.test(err?.message || '');

// Si el proveedor sugiere cuándo reintentar ("Please retry in 25.79s"),
// respetamos ese tiempo (con un pequeño margen) en vez de esperar fijo.
function retryDelayFromError(err) {
  const match = /retry in ([\d.]+)\s*s/i.exec(err?.message || '');
  if (match) {
    const secs = Number(match[1]);
    if (Number.isFinite(secs)) return Math.min(60_000, Math.ceil(secs * 1000) + 2_000);
  }
  return BURST_WAIT_MS;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function detectDuplicate(data) {
  const invoices = useInvoiceStore.getState().invoices;
  return invoices.some((inv) => {
    if (!inv.providerRut || !data.providerRut) return false;
    return (
      cleanRut(inv.providerRut) === cleanRut(data.providerRut) &&
      String(inv.documentNumber).trim() === String(data.documentNumber).trim() &&
      inv.date === data.date
    );
  });
}

// ── Persistencia en IndexedDB (best-effort: nunca bloquea la UI) ──

/** Campos serializables de un item (excluye file/tempPreviewUrl). */
function toRecord(item) {
  const { file, tempPreviewUrl, ...rest } = item;
  return { ...rest, fileBlob: file };
}

function persistPut(item) {
  db.uploadQueue.put(toRecord(item)).catch((err) => {
    logger.error('[uploadQueue] No se pudo persistir el item:', err);
  });
}

function persistPatch(id, patch) {
  // Nunca persistir referencias de runtime
  const { file: _f, tempPreviewUrl: _t, ...clean } = patch;
  if (Object.keys(clean).length === 0) return;
  db.uploadQueue.update(id, clean).catch((err) => {
    logger.error('[uploadQueue] No se pudo actualizar el item persistido:', err);
  });
}

function persistDelete(ids) {
  db.uploadQueue.bulkDelete(ids).catch((err) => {
    logger.error('[uploadQueue] No se pudo borrar del almacenamiento:', err);
  });
}

// Las correcciones de revisión llegan por teclazo: se agrupan antes de escribir
const reviewWriteTimers = new Map();
function persistReviewDebounced(id, review) {
  clearTimeout(reviewWriteTimers.get(id));
  reviewWriteTimers.set(
    id,
    setTimeout(() => {
      reviewWriteTimers.delete(id);
      db.uploadQueue.update(id, { review }).catch((err) => {
        logger.error('[uploadQueue] No se pudo guardar la corrección:', err);
      });
    }, 250)
  );
}

const useUploadQueueStore = create((set, get) => ({
  queue: [],
  isProcessing: false,
  isHydrated: false,
  // Resumen del último lote terminado; lo consume UploadQueueWatcher
  // para notificar aunque el usuario esté en otra página.
  lastBatchSummary: null,

  _updateItem(id, patch) {
    set((state) => ({
      queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
    persistPatch(id, patch);
  },

  /**
   * Rehidrata la cola desde IndexedDB al abrir la app. Los items que
   * quedaron a medio procesar vuelven a 'pending' y se retoman solos.
   */
  async hydrate() {
    if (get().isHydrated) return;
    try {
      const records = await db.uploadQueue.orderBy('addedAt').toArray();
      const restored = records
        .filter((r) => r.fileBlob)
        .map(({ fileBlob, ...rest }) => ({
          ...rest,
          status: ['processing', 'waiting'].includes(rest.status) ? 'pending' : rest.status,
          progress: ['processing', 'waiting'].includes(rest.status) ? 0 : rest.progress,
          burstWaits: 0,
          file: fileBlob,
          tempPreviewUrl: URL.createObjectURL(fileBlob),
        }));
      if (restored.length > 0) {
        // Los items agregados antes de terminar la hidratación van después
        set((state) => ({
          queue: [...restored, ...state.queue.filter((q) => !restored.some((r) => r.id === q.id))],
          isHydrated: true,
        }));
        if (restored.some((r) => r.status === 'pending')) get()._process();
      } else {
        set({ isHydrated: true });
      }
    } catch (err) {
      logger.error('[uploadQueue] Falló la rehidratación de la cola:', err);
      set({ isHydrated: true });
    }
  },

  /**
   * Agrega archivos ya validados a la cola (comprime antes) y arranca
   * el procesamiento. Devuelve cuántos se agregaron.
   */
  async addFiles(files) {
    let added = 0;
    for (const rawFile of files) {
      // Deduplicar contra la cola actual por nombre y tamaño originales
      if (get().queue.some((q) => q.name === rawFile.name && q.size === rawFile.size)) {
        continue;
      }
      const file = await compressImage(rawFile);
      const item = {
        id: Math.random().toString(36).substring(2, 11),
        file,
        name: rawFile.name,
        size: rawFile.size,
        status: 'pending',
        progress: 0,
        error: null,
        extractedData: null,
        review: null,
        isDuplicate: false,
        burstWaits: 0,
        addedAt: Date.now(),
        tempPreviewUrl: URL.createObjectURL(file),
      };
      set((state) => ({ queue: [...state.queue, item] }));
      persistPut(item);
      added++;
    }
    if (added > 0) get()._process();
    return added;
  },

  /**
   * Guarda correcciones hechas durante la revisión, mezclándolas sobre
   * los datos extraídos. Sobreviven recargas (IndexedDB).
   */
  updateReview(id, patch) {
    let merged = null;
    set((state) => ({
      queue: state.queue.map((item) => {
        if (item.id !== id) return item;
        merged = { ...(item.review || {}), ...patch };
        return { ...item, review: merged };
      }),
    }));
    if (merged) persistReviewDebounced(id, merged);
  },

  removeItem(id) {
    const item = get().queue.find((q) => q.id === id);
    if (item?.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    set((state) => ({ queue: state.queue.filter((q) => q.id !== id) }));
    persistDelete([id]);
  },

  /** Saca de la cola los items ya guardados como comprobantes. */
  removeItems(ids) {
    const idSet = new Set(ids);
    get().queue.forEach((item) => {
      if (idSet.has(item.id) && item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    });
    set((state) => ({ queue: state.queue.filter((q) => !idSet.has(q.id)) }));
    persistDelete(ids);
  },

  clearQueue() {
    const ids = get().queue.map((q) => q.id);
    get().queue.forEach((item) => {
      if (item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    });
    set({ queue: [], lastBatchSummary: null });
    persistDelete(ids);
  },

  retryItem(id) {
    get()._updateItem(id, { status: 'pending', progress: 0, error: null, burstWaits: 0 });
    get()._process();
  },

  retryFailed() {
    set((state) => ({
      queue: state.queue.map((item) =>
        item.status === 'error'
          ? { ...item, status: 'pending', progress: 0, error: null, burstWaits: 0 }
          : item
      ),
    }));
    get()
      .queue.filter((q) => q.status === 'pending')
      .forEach((q) => persistPatch(q.id, { status: 'pending', progress: 0, error: null }));
    get()._process();
  },

  async _process() {
    if (get().isProcessing) return;
    set({ isProcessing: true });

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const item = get().queue.find((q) => q.status === 'pending');
      if (!item) break;

      get()._updateItem(item.id, { status: 'processing', progress: 20 });

      try {
        const data = await extractInvoiceData(item.file);
        get()._updateItem(item.id, {
          status: 'done',
          progress: 100,
          isDuplicate: detectDuplicate(data),
          extractedData: {
            providerName: data.providerName || '',
            providerRut: data.providerRut ? formatRut(data.providerRut) : '',
            documentType: data.documentType || 'Boleta',
            documentNumber: data.documentNumber || '',
            date: data.date || new Date().toISOString().split('T')[0],
            detail: data.detail || '',
            expenseType: data.expenseType || '',
            netAmount: data.netAmount || 0,
            totalBoletaServicios: data.totalBoletaServicios || 0,
            totalBoletaHonorarios: data.totalBoletaHonorarios || 0,
            specificTax: data.specificTax || 0,
            ivaAmount: data.ivaAmount || 0,
            totalAmount: data.totalAmount || 0,
            taxStatus: 'pending',
            status: 'pending',
            notes: data.notes || '',
          },
        });
      } catch (err) {
        logger.error(`[uploadQueue] Error procesando ${item.name}:`, err);

        if (isBurstLimitError(err) && item.burstWaits < MAX_BURST_WAITS) {
          // Límite de ráfaga: esperar y reintentar el mismo archivo
          get()._updateItem(item.id, {
            status: 'waiting',
            progress: 0,
            burstWaits: item.burstWaits + 1,
            error: null,
          });
          await sleep(retryDelayFromError(err));
          // Puede haber sido removido durante la espera
          if (get().queue.some((q) => q.id === item.id)) {
            get()._updateItem(item.id, { status: 'pending' });
          }
          continue;
        }

        if (isMonthlyLimitError(err)) {
          // Límite mensual del plan: no tiene sentido seguir intentando
          const message = err.message;
          const affected = get().queue.filter(
            (q) => q.id === item.id || q.status === 'pending' || q.status === 'waiting'
          );
          set((state) => ({
            queue: state.queue.map((q) =>
              q.id === item.id || q.status === 'pending' || q.status === 'waiting'
                ? { ...q, status: 'error', progress: 100, error: message }
                : q
            ),
          }));
          affected.forEach((q) => persistPatch(q.id, { status: 'error', progress: 100, error: message }));
          break;
        }

        get()._updateItem(item.id, {
          status: 'error',
          progress: 100,
          error: err.message || 'Error desconocido al procesar.',
        });
      }
    }

    const queue = get().queue;
    set({
      isProcessing: false,
      lastBatchSummary: {
        at: Date.now(),
        done: queue.filter((q) => q.status === 'done').length,
        errors: queue.filter((q) => q.status === 'error').length,
        duplicates: queue.filter((q) => q.status === 'done' && q.isDuplicate).length,
      },
    });
  },
}));

// Rehidratar apenas carga el módulo (solo en navegador, no en tests SSR)
if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  useUploadQueueStore.getState().hydrate();
}

export default useUploadQueueStore;
