import { create } from 'zustand';
import { extractInvoiceData } from '../services/vlmService';
import { compressImage } from '../utils/imageCompression';
import { cleanRut, formatRut } from '../utils/rutValidator';
import useInvoiceStore from './invoiceStore';

/**
 * Cola de extracción de boletas, FUERA de los componentes.
 *
 * Antes la cola vivía en el estado local de UploadPage: al navegar a otra
 * ruta el componente se desmontaba y se perdía todo el procesamiento.
 * Como store de Zustand (módulo singleton), la extracción continúa aunque
 * el usuario cambie de página; UploadPage es solo una vista de la cola.
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

const isBurstLimitError = (err) => /demasiadas extracciones/i.test(err?.message || '');
const isMonthlyLimitError = (err) => /límite mensual/i.test(err?.message || '');

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

const useUploadQueueStore = create((set, get) => ({
  queue: [],
  isProcessing: false,
  // Resumen del último lote terminado; lo consume UploadQueueWatcher
  // para notificar aunque el usuario esté en otra página.
  lastBatchSummary: null,

  _updateItem(id, patch) {
    set((state) => ({
      queue: state.queue.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
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
        isDuplicate: false,
        burstWaits: 0,
        tempPreviewUrl: URL.createObjectURL(file),
      };
      set((state) => ({ queue: [...state.queue, item] }));
      added++;
    }
    if (added > 0) get()._process();
    return added;
  },

  removeItem(id) {
    const item = get().queue.find((q) => q.id === id);
    if (item?.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    set((state) => ({ queue: state.queue.filter((q) => q.id !== id) }));
  },

  /** Saca de la cola los items ya guardados como comprobantes. */
  removeItems(ids) {
    const idSet = new Set(ids);
    get().queue.forEach((item) => {
      if (idSet.has(item.id) && item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    });
    set((state) => ({ queue: state.queue.filter((q) => !idSet.has(q.id)) }));
  },

  clearQueue() {
    get().queue.forEach((item) => {
      if (item.tempPreviewUrl) URL.revokeObjectURL(item.tempPreviewUrl);
    });
    set({ queue: [], lastBatchSummary: null });
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
        console.error(`[uploadQueue] Error procesando ${item.name}:`, err);

        if (isBurstLimitError(err) && item.burstWaits < MAX_BURST_WAITS) {
          // Límite de ráfaga: esperar y reintentar el mismo archivo
          get()._updateItem(item.id, {
            status: 'waiting',
            progress: 0,
            burstWaits: item.burstWaits + 1,
            error: null,
          });
          await sleep(BURST_WAIT_MS);
          // Puede haber sido removido durante la espera
          if (get().queue.some((q) => q.id === item.id)) {
            get()._updateItem(item.id, { status: 'pending' });
          }
          continue;
        }

        if (isMonthlyLimitError(err)) {
          // Límite mensual del plan: no tiene sentido seguir intentando
          const message = err.message;
          set((state) => ({
            queue: state.queue.map((q) =>
              q.id === item.id || q.status === 'pending' || q.status === 'waiting'
                ? { ...q, status: 'error', progress: 100, error: message }
                : q
            ),
          }));
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

export default useUploadQueueStore;
