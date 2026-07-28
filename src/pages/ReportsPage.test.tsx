import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks del borde de persistencia / exportación ──
const invoicesFixture: any[] = [];
const updateCalls: Array<[string, any]> = [];
vi.mock('../services/storage/StorageProvider', () => ({
  getStorageProvider: () => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    getAll: vi.fn().mockImplementation(() => Promise.resolve([...invoicesFixture])),
    update: vi.fn().mockImplementation((id: string, updates: any) => {
      updateCalls.push([id, updates]);
      return Promise.resolve({ id, ...updates });
    }),
    getSetting: vi.fn().mockResolvedValue(null),
    saveSetting: vi.fn().mockResolvedValue(undefined),
  }),
}));

const exportRendicionMock = vi.fn().mockResolvedValue(new ArrayBuffer(8));
vi.mock('../services/exportService', () => ({
  exportToRendicion: (...a: any[]) => exportRendicionMock(...a),
  exportToExcel: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
  exportToCSV: vi.fn().mockReturnValue('csv'),
  downloadFile: vi.fn(),
}));

import ReportsPage from './ReportsPage';
import { ToastProvider } from '../components/ui/Toast';
import useInvoiceStore from '../store/invoiceStore';

const inv = (id: string, date: string, taxStatus: string, total: number) => ({
  id, date, taxStatus,
  providerName: `Proveedor ${id}`,
  providerRut: '12.345.678-5',
  documentType: 'Boleta',
  documentNumber: id,
  detail: '',
  expenseType: 'Materiales de Construccion',
  netAmount: 0, ivaAmount: 0, totalAmount: total,
  totalBoletaServicios: total, totalBoletaHonorarios: 0, specificTax: 0,
});

function renderPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <ReportsPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe('ReportsPage — flujo período → selección → exportar', () => {
  beforeEach(() => {
    // Reloj fijo: "hoy" = 15 jul 2026 → mes anterior por defecto = junio 2026
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 6, 15));

    updateCalls.length = 0;
    exportRendicionMock.mockClear();
    useInvoiceStore.setState({ invoices: [] });

    invoicesFixture.length = 0;
    invoicesFixture.push(
      inv('jun1', '2026-06-05', 'pending', 1000),
      inv('jun2', '2026-06-20', 'pending', 2000),
      inv('jun3', '2026-06-28', 'declared', 3000), // ya declarada
      inv('may1', '2026-05-10', 'pending', 9000),  // otro mes
    );
    // Plantilla por defecto disponible (fetch de /template.xlsm)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, arrayBuffer: async () => new ArrayBuffer(16),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('por defecto muestra el mes anterior (junio) y su total seleccionado', async () => {
    renderPage();
    // Cargan las boletas de junio (jun1/jun2/jun3), no la de mayo
    await screen.findByText('Proveedor jun2');
    expect(screen.getByText('Proveedor jun1')).toBeInTheDocument();
    expect(screen.queryByText('Proveedor may1')).not.toBeInTheDocument();
    // Barra de exportación: 3 seleccionadas por defecto, total $6.000
    const bar = screen.getByText(/comprobante\(s\) seleccionados/i).closest('.export-bar')!;
    expect(within(bar as HTMLElement).getByText('3')).toBeInTheDocument();
  });

  it('cambiar a "Año tributario" incluye todos los meses de 2026', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await screen.findByText('Proveedor jun2');

    await user.click(screen.getByRole('button', { name: 'Año tributario' }));
    // Ahora también aparece la boleta de mayo
    await screen.findByText('Proveedor may1');
  });

  it('exportar a rendición marca como declaradas las pendientes seleccionadas', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    renderPage();
    await screen.findByText('Proveedor jun2');

    await user.click(screen.getByRole('button', { name: /Exportar a plantilla de rendición/i }));

    await waitFor(() => expect(exportRendicionMock).toHaveBeenCalledTimes(1));
    // Solo las pendientes de la selección se marcan declaradas (jun1, jun2),
    // no la que ya estaba declarada (jun3)
    await waitFor(() => {
      const marcadas = updateCalls.filter(([, u]) => u.taxStatus === 'declared').map(([id]) => id);
      expect(marcadas.sort()).toEqual(['jun1', 'jun2']);
    });
    expect(screen.getByText(/marcadas como declaradas/i)).toBeInTheDocument();
  });
});
