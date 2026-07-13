import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExtract = vi.fn();
vi.mock('../services/vlmService', () => ({
  extractInvoiceData: (...args: unknown[]) => mockExtract(...args),
}));
// Sin compresión real en tests (usa canvas/createImageBitmap)
vi.mock('../utils/imageCompression', () => ({
  compressImage: async (file: File) => file,
}));
// invoiceStore arrastra Dexie (IndexedDB real); solo se usa para duplicados
vi.mock('./invoiceStore', () => ({
  default: { getState: () => ({ invoices: [] }) },
}));
// La persistencia en IndexedDB es best-effort; en tests se simula la tabla
vi.mock('../services/storage/db', () => ({
  default: {
    uploadQueue: {
      put: vi.fn(async () => undefined),
      update: vi.fn(async () => undefined),
      bulkDelete: vi.fn(async () => undefined),
      orderBy: () => ({ toArray: async () => [] }),
    },
  },
}));

import useUploadQueueStore from '../store/uploadQueueStore';

const validData = {
  providerName: 'Sodimac',
  providerRut: '12.345.678-5',
  documentType: 'Factura',
  documentNumber: '100',
  date: '2026-01-15',
  detail: 'Materiales',
  expenseType: 'Materiales de Construccion',
  netAmount: 1000,
  totalBoletaServicios: 0,
  totalBoletaHonorarios: 0,
  specificTax: 0,
  ivaAmount: 190,
  totalAmount: 1190,
};

function makeFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'image/jpeg' });
}

async function waitForIdle() {
  // Espera a que el loop de procesamiento termine (incluye esperas de cuota)
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 10));
    const s = useUploadQueueStore.getState();
    if (!s.isProcessing && !s.queue.some((q) => q.status === 'pending' || q.status === 'processing')) {
      return;
    }
  }
}

describe('uploadQueueStore', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:test'),
      revokeObjectURL: vi.fn(),
    });
    mockExtract.mockReset();
    useUploadQueueStore.setState({ queue: [], isProcessing: false, lastBatchSummary: null });
  });

  it('procesa los archivos agregados y deja los datos extraídos listos', async () => {
    mockExtract.mockResolvedValue(validData);

    const added = await useUploadQueueStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    expect(added).toBe(2);
    await waitForIdle();

    const { queue, lastBatchSummary } = useUploadQueueStore.getState();
    expect(queue).toHaveLength(2);
    expect(queue.every((q) => q.status === 'done')).toBe(true);
    expect(queue[0].extractedData?.providerRut).toBe('12.345.678-5');
    expect(lastBatchSummary).toMatchObject({ done: 2, errors: 0 });
  });

  it('no agrega archivos duplicados (mismo nombre y tamaño)', async () => {
    mockExtract.mockResolvedValue(validData);
    await useUploadQueueStore.getState().addFiles([makeFile('a.jpg')]);
    const added = await useUploadQueueStore.getState().addFiles([makeFile('a.jpg')]);
    expect(added).toBe(0);
    expect(useUploadQueueStore.getState().queue).toHaveLength(1);
  });

  it('marca error en fallos puntuales y permite reintentar', async () => {
    mockExtract.mockRejectedValueOnce(new Error('Imagen ilegible'));
    await useUploadQueueStore.getState().addFiles([makeFile('mala.jpg')]);
    await waitForIdle();

    let item = useUploadQueueStore.getState().queue[0];
    expect(item.status).toBe('error');
    expect(item.error).toContain('ilegible');
    expect(useUploadQueueStore.getState().lastBatchSummary).toMatchObject({ done: 0, errors: 1 });

    mockExtract.mockResolvedValueOnce(validData);
    useUploadQueueStore.getState().retryItem(item.id);
    await waitForIdle();

    item = useUploadQueueStore.getState().queue[0];
    expect(item.status).toBe('done');
  });

  it('al alcanzar el límite mensual detiene la cola y marca los pendientes', async () => {
    mockExtract.mockRejectedValue(new Error('Alcanzaste el límite mensual de extracciones con IA de tu plan.'));
    await useUploadQueueStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]);
    await waitForIdle();

    const { queue } = useUploadQueueStore.getState();
    expect(queue.every((q) => q.status === 'error')).toBe(true);
    expect(queue.every((q) => /límite mensual/.test(q.error ?? ''))).toBe(true);
    // Solo se llamó a la API una vez: no quemó reintentos con los demás
    expect(mockExtract).toHaveBeenCalledTimes(1);
  });

  it('ante el 429 crudo de Google (quota) espera y reintenta en vez de fallar', async () => {
    // Primer intento: error de cuota del proveedor con hint de reintento corto
    mockExtract
      .mockRejectedValueOnce(
        new Error('You exceeded your current quota. * Quota exceeded ... Please retry in 0.01s')
      )
      .mockResolvedValueOnce(validData);

    await useUploadQueueStore.getState().addFiles([makeFile('a.jpg')]);
    await waitForIdle();

    const item = useUploadQueueStore.getState().queue[0];
    expect(item.status).toBe('done');
    expect(mockExtract).toHaveBeenCalledTimes(2);
  });

  it('removeItems saca de la cola los items ya guardados', async () => {
    mockExtract.mockResolvedValue(validData);
    await useUploadQueueStore.getState().addFiles([makeFile('a.jpg'), makeFile('b.jpg')]);
    await waitForIdle();

    const ids = useUploadQueueStore.getState().queue.map((q) => q.id);
    useUploadQueueStore.getState().removeItems([ids[0]]);
    const queue = useUploadQueueStore.getState().queue;
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe(ids[1]);
  });
});
