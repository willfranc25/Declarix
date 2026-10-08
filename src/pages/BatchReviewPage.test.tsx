import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../context/CompanyContext',()=>({useCompany:()=>({activeCompany:{id:'company',categories:[]}})}));
vi.mock('../services/jobService',()=>({patchReview:vi.fn().mockResolvedValue(undefined),listJobs:vi.fn().mockResolvedValue([]),documentRequest:vi.fn(),uploadDocument:vi.fn()}));
// ── Mocks de persistencia (la lógica real de stores sí se ejercita) ──
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// storage provider en memoria (addInvoice → save)
const saved: any[] = [];
vi.mock('../services/storage/StorageProvider', () => ({
  getStorageProvider: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockImplementation((data: any) => {
      const inv = { ...data, id: `inv-${saved.length + 1}` };
      saved.push(inv);
      return Promise.resolve(inv);
    }),
    saveImage: vi.fn().mockResolvedValue(undefined),
  }),
}));

// db de la cola (evita que hydrate() reviente con IndexedDB mockeado)
vi.mock('../services/storage/db', () => ({
  default: {
    uploadQueue: {
      put: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(undefined),
      bulkDelete: vi.fn().mockResolvedValue(undefined),
      orderBy: () => ({ toArray: async () => [] }),
    },
  },
}));

import BatchReviewPage from './BatchReviewPage';
import { ToastProvider } from '../components/ui/Toast';
import useUploadQueueStore from '../store/uploadQueueStore';
import useInvoiceStore from '../store/invoiceStore';

const VALID_RUT = '12.345.678-5';

function doneItem(id: string, over: Record<string, any> = {}) {
  return {
    id,
    name: `${id}.jpg`,
    size: 1000,
    status: 'done',
    progress: 100,
    error: null,
    isDuplicate: false,
    file: new File([new Uint8Array([1])], `${id}.jpg`, { type: 'image/jpeg' }),
    tempPreviewUrl: `blob:${id}`,
    review: null,
    extractedData: {
      providerName: 'Sodimac',
      providerRut: VALID_RUT,
      documentType: 'Boleta',
      documentNumber: '100',
      date: '2026-01-15',
      detail: '',
      expenseType: 'Materiales de Construccion',
      netAmount: 0,
      ivaAmount: 0,
      totalAmount: 11900,
      totalBoletaServicios: 11900,
      totalBoletaHonorarios: 0,
      specificTax: 0,
      taxStatus: 'pending',
      status: 'pending',
    },
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <BatchReviewPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('BatchReviewPage — flujo revisar → guardar', () => {
  it('presents an old voucher operation as the read-only 0000 folio without changing other review fields', () => {
    const item = doneItem('voucher');
    useUploadQueueStore.setState({queue:[{...item,extractedData:{...item.extractedData,documentType:'Comprobante de pago electrónico',documentNumber:'002211',referenceNumber:'002211'},review:{documentNumber:'155379',providerName:'Proveedor corregido'}}] as any});
    renderPage();
    const folio = screen.getByLabelText('Folio / N° documento') as HTMLInputElement;
    expect(folio.value).toBe('0000');
    expect(folio.readOnly).toBe(true);
    expect(screen.getByDisplayValue('Proveedor corregido')).toBeInTheDocument();
  });
  beforeEach(() => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: () => {} });
    navigateMock.mockReset();
    saved.length = 0;
    useInvoiceStore.setState({ invoices: [] });
    useUploadQueueStore.setState({ queue: [], isProcessing: false, isHydrated: true,
      removeItems: async (ids) => {useUploadQueueStore.setState(s=>({queue:s.queue.filter(q=>!ids.includes(q.id))}));},
    });
  });

  it('estado vacío invita a cargar boletas', () => {
    renderPage();
    expect(screen.getByText(/No hay boletas para revisar/i)).toBeInTheDocument();
  });
  it('saves an invalid printed RUT only after manual confirmation, including the problems filter', async () => {
    const user=userEvent.setup();
    useUploadQueueStore.setState({queue:[doneItem('rut', {extractedData:{...doneItem('rut').extractedData,providerRut:'78119065-K'}})] as any});
    renderPage();
    await user.click(screen.getByRole('button',{name:/Guardar y seguir/i}));
    expect(saved).toHaveLength(0);
    await user.click(screen.getByRole('checkbox',{name:'Mostrar solo con problemas'}));
    await user.click(screen.getByRole('checkbox',{name:'Confirmo que el RUT coincide con el original'}));
    expect(screen.getByLabelText('RUT proveedor')).toHaveValue('78119065-K');
    await user.click(screen.getByRole('button',{name:/Guardar y seguir/i}));
    await waitFor(()=>expect(saved).toHaveLength(1));
    expect(saved[0]).toMatchObject({providerRut:'78119065-K',rutConfirmation:{confirmed:true,rut:'78119065K'}});
  });
  it('requires a fresh confirmation after changing the printed RUT', async () => {
    const user=userEvent.setup();
    useUploadQueueStore.setState({queue:[doneItem('rut', {extractedData:{...doneItem('rut').extractedData,providerRut:'78119065-K'}})] as any});
    renderPage();
    await user.click(screen.getByRole('checkbox',{name:'Confirmo que el RUT coincide con el original'}));
    const input=screen.getByLabelText('RUT proveedor');
    await user.clear(input);await user.type(input,'78119066-K');
    expect(screen.getByRole('checkbox',{name:'Confirmo que el RUT coincide con el original'})).not.toBeChecked();
    await user.click(screen.getByRole('button',{name:/Guardar y seguir/i}));
    expect(saved).toHaveLength(0);
  });
  it('confirms from the table and preserves the exception during bulk save', async () => {
    const user=userEvent.setup();
    useUploadQueueStore.setState({queue:[doneItem('rut', {extractedData:{...doneItem('rut').extractedData,providerRut:'78119065-K'}}),doneItem('valid')] as any});
    renderPage();await user.click(screen.getByRole('button',{name:'Tabla',exact:true}));
    await user.click(screen.getByRole('button',{name:'Guardar todos (2)',exact:true}));
    expect(saved).toHaveLength(0);
    await user.click(screen.getByRole('checkbox',{name:'Confirmo que el RUT coincide con el original'}));
    await user.click(screen.getByRole('button',{name:'Guardar todos (2)',exact:true}));
    await waitFor(()=>expect(saved).toHaveLength(2));
    expect(saved.find(row=>row.providerRut==='78119065-K').rutConfirmation).toMatchObject({confirmed:true,rut:'78119065K'});
  });

  it('muestra los datos extraídos y marca la boleta sin RUT', () => {
    // La segunda boleta viene sin RUT (extracción parcial)
    useUploadQueueStore.setState({
      queue: [
        doneItem('a'),
        doneItem('b', { extractedData: { ...doneItem('b').extractedData, providerRut: '' } }),
      ] as any,
    });
    renderPage();

    // La primera (válida) es la fila activa: su proveedor aparece en el form
    expect(screen.getByDisplayValue('Sodimac')).toBeInTheDocument();
    // Encabezado del lote: 1 OK + 1 con errores
    expect(screen.getByText('1 OK')).toBeInTheDocument();
    expect(screen.getByText('1 con errores')).toBeInTheDocument();
  });

  it('mantiene la vista previa al ampliar y solicita detalle sin descargar el original', async () => {
    const user = userEvent.setup();
    const original = vi.fn().mockResolvedValue('blob:original');
    const detail = vi.fn().mockImplementation(() => new Promise(() => {}));
    useUploadQueueStore.setState({
      ensurePreview: vi.fn().mockResolvedValue('blob:a'),
      ensureOriginal: original,
      ensureDetailPreview: detail,
      queue: [doneItem('a', {
        jobId: 'job-a', mimeType: 'image/jpeg',
        extractedData: {
          ...doneItem('a').extractedData,
          source_job_id: 'job-a',
          fieldLocations: { documentNumber: { x: 200, y: 100, width: 100, height: 30 } },
        },
      })] as any,
    });
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Ampliar Folio / N° documento en la foto' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await waitFor(() => expect(detail).toHaveBeenCalledWith('job-a'));
    expect(original).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole('dialog').querySelector('img')).toHaveAttribute('src', 'blob:a'));
    expect(screen.getByText('400%')).toBeInTheDocument();
  });

  it('opens cached detail immediately at 100% and resets it on every reopening', async () => {
    const user = userEvent.setup();
    const before = useUploadQueueStore.getState();
    const detail = vi.fn().mockResolvedValue('blob:ready-detail');
    useUploadQueueStore.setState({
      getReadyDetailPreview: () => 'blob:ready-detail',
      isPreviewDecoded: () => true,
      ensureDetailPreview: detail,
      queue: [doneItem('a', { jobId: 'job-a', mimeType: 'image/jpeg',
        extractedData: { ...doneItem('a').extractedData, source_job_id: 'job-a' } })] as any,
    });
    try {
      renderPage();
      await waitFor(() => expect(detail).toHaveBeenCalled());
      const count = detail.mock.calls.length;
      await user.click(screen.getByRole('button', { name: /^Ampliar$/ }));
      const dialog = screen.getByRole('dialog');
      expect(dialog.querySelector('img')).toHaveAttribute('src', 'blob:ready-detail');
      expect(dialog.querySelector('img')).toHaveStyle({ visibility: 'visible' });
      expect(within(dialog).queryByText('Cargando imagen…')).toBeNull();
      expect(within(dialog).getByText('100%')).toBeInTheDocument();
      expect(detail.mock.calls.length).toBe(count);
      await user.click(within(dialog).getByRole('button', { name: 'Acercar' }));
      expect(within(dialog).getByText('130%')).toBeInTheDocument();
      await user.click(within(dialog).getByRole('button', { name: 'Cerrar' }));
      await user.click(screen.getByRole('button', { name: /^Ampliar$/ }));
      expect(within(screen.getByRole('dialog')).getByText('100%')).toBeInTheDocument();
    } finally {
      useUploadQueueStore.setState({ getReadyDetailPreview: before.getReadyDetailPreview,
        isPreviewDecoded: before.isPreviewDecoded, ensureDetailPreview: before.ensureDetailPreview });
    }
  });

  it('"Guardar y seguir" guarda el comprobante, lo saca de la cola y avanza', async () => {
    const user = userEvent.setup();
    useUploadQueueStore.setState({
      queue: [
        doneItem('a'),
        doneItem('b', { extractedData: { ...doneItem('b').extractedData, providerRut: '' } }),
      ] as any,
    });
    renderPage();

    await user.click(screen.getByRole('button', { name: /Guardar y seguir/i }));

    await waitFor(() => {
      // Se guardó 1 comprobante en el store
      expect(useInvoiceStore.getState().invoices).toHaveLength(1);
    });
    expect(saved).toHaveLength(1);
    expect(saved[0].providerRut).toBe(VALID_RUT);
    // Salió de la cola: queda solo la boleta 'b' (sin RUT)
    expect(useUploadQueueStore.getState().queue.map((q) => q.id)).toEqual(['b']);
    // Avanzó a 'b': ahora el form muestra su error de RUT (alerta + inline)
    await waitFor(() => expect(screen.getAllByText('Falta RUT').length).toBeGreaterThan(0));
    // Toast de confirmación
    expect(screen.getByText('Comprobante guardado.')).toBeInTheDocument();
    // No navegó a /invoices porque aún queda una boleta
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
