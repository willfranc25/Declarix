import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { getPage } = vi.hoisted(() => ({ getPage: vi.fn() }));
vi.mock('../services/storage/StorageProvider', () => ({
  getStorageProvider: () => ({ initialize: async () => {}, getPage }),
}));
vi.mock('../services/organizationService', () => ({ getWorkspaceGeneration: () => 1 }));
vi.mock('../store/invoiceStore', () => ({ default: () => ({
  filters: {}, setFilters: vi.fn(), clearFilters: vi.fn(),
  deleteInvoice: vi.fn(), updateTaxStatus: vi.fn(),
}) }));
vi.mock('../components/ui/Toast', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
import InvoicesPage from './InvoicesPage';

describe('Comprobantes', () => {
  it('loads one page and shows issue and upload dates separately', async () => {
    getPage.mockImplementation(({ page }) => Promise.resolve({
      total: 26,
      rows: [{ id: String(page), providerName: `Proveedor ${page}`, date: '2026-09-21',
        uploadedAt: '2026-09-30T15:40:00Z', documentType: 'Boleta', expenseType: 'Otros',
        totalAmount: 1000, taxStatus: 'reviewed' }],
    }));
    render(<MemoryRouter><InvoicesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Proveedor 1')).toBeInTheDocument());
    expect(screen.getByRole('columnheader', { name: 'Emisión' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Carga al sistema' })).toBeInTheDocument();
    expect(screen.getByText('21/09/2026')).toBeInTheDocument();
    expect(getPage).toHaveBeenCalledWith({ page: 1, pageSize: 25, filters: {} });
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() => expect(screen.getByText('Proveedor 2')).toBeInTheDocument());
    expect(getPage).toHaveBeenCalledWith({ page: 2, pageSize: 25, filters: {} });
  });
});
