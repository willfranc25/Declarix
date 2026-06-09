import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the storage provider before importing the store
vi.mock('../services/storage/StorageProvider', () => {
  const mockInvoices: any[] = [];
  const mockImages = new Map();
  const mockSettings = new Map();

  return {
    getStorageProvider: () => ({
      initialize: vi.fn().mockResolvedValue(undefined),
      getAll: vi.fn().mockImplementation(() => Promise.resolve([...mockInvoices].sort((a, b) => b.date.localeCompare(a.date)))),
      save: vi.fn().mockImplementation((data) => {
        const newInv = { ...data, id: data.id || `test-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), taxStatus: data.taxStatus || 'pending' };
        mockInvoices.push(newInv);
        return Promise.resolve(newInv);
      }),
      update: vi.fn().mockImplementation((id, updates) => {
        const idx = mockInvoices.findIndex(i => i.id === id);
        if (idx >= 0) {
          mockInvoices[idx] = { ...mockInvoices[idx], ...updates, updatedAt: new Date().toISOString() };
          return Promise.resolve(mockInvoices[idx]);
        }
        return Promise.resolve(null);
      }),
      delete: vi.fn().mockImplementation((id) => {
        const idx = mockInvoices.findIndex(i => i.id === id);
        if (idx >= 0) mockInvoices.splice(idx, 1);
        mockImages.delete(id);
        return Promise.resolve();
      }),
      saveImage: vi.fn().mockImplementation((id, blob) => { mockImages.set(id, blob); return Promise.resolve(); }),
      getImage: vi.fn().mockImplementation((id) => Promise.resolve(mockImages.get(id) || null)),
      deleteImage: vi.fn().mockImplementation((id) => { mockImages.delete(id); return Promise.resolve(); }),
      getSetting: vi.fn().mockImplementation((key) => Promise.resolve(mockSettings.get(key) || null)),
      saveSetting: vi.fn().mockImplementation((key, value) => { mockSettings.set(key, value); return Promise.resolve(); }),
      clearAll: vi.fn().mockImplementation(() => { mockInvoices.length = 0; mockImages.clear(); return Promise.resolve(); }),
      importInvoice: vi.fn().mockImplementation((inv) => {
        const idx = mockInvoices.findIndex(i => i.id === inv.id);
        if (idx >= 0) mockInvoices[idx] = inv;
        else mockInvoices.push(inv);
        return Promise.resolve();
      }),
    }),
  };
});

// Import after mock
import useInvoiceStore from '../store/invoiceStore';

describe('invoiceStore', () => {
  beforeEach(() => {
    // Reset store state
    useInvoiceStore.setState({
      invoices: [],
      filters: {},
      isLoading: false,
      error: null,
    });
  });

  it('should have initial empty state', () => {
    const state = useInvoiceStore.getState();
    expect(state.invoices).toEqual([]);
    expect(state.filters).toEqual({});
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('should add invoice with default taxStatus pending', async () => {
    const newInvoice = await useInvoiceStore.getState().addInvoice({
      providerName: 'Test Proveedor',
      providerRut: '12.345.678-9',
      documentType: 'Boleta',
      documentNumber: '12345',
      date: '2025-02-05',
      detail: 'Test',
      expenseType: 'Combustible',
      netAmount: 10000,
      ivaAmount: 1900,
      totalAmount: 11900,
      status: 'pending',
      notes: '',
    });

    expect(newInvoice.id).toBeDefined();
    expect(newInvoice.providerName).toBe('Test Proveedor');
    expect(newInvoice.taxStatus).toBe('pending'); // default
  });

  it('should load invoices', async () => {
    await useInvoiceStore.getState().loadInvoices();
    const state = useInvoiceStore.getState();
    expect(state.invoices).toBeInstanceOf(Array);
    expect(state.isLoading).toBe(false);
  });

  it('should set and clear filters', () => {
    useInvoiceStore.getState().setFilters({ year: 2025, month: 2 });
    let state = useInvoiceStore.getState();
    expect(state.filters).toEqual({ year: 2025, month: 2 });

    useInvoiceStore.getState().clearFilters();
    state = useInvoiceStore.getState();
    expect(state.filters).toEqual({});
  });

  it('should filter invoices by month', async () => {
    // Add some invoices
    await useInvoiceStore.getState().addInvoice({ providerName: 'A', date: '2025-02-05', expenseType: 'Combustible', totalAmount: 1000, status: 'pending', taxStatus: 'pending' });
    await useInvoiceStore.getState().addInvoice({ providerName: 'B', date: '2025-03-10', expenseType: 'Almuerzos', totalAmount: 2000, status: 'pending', taxStatus: 'pending' });

    useInvoiceStore.getState().setFilters({ month: 2 });
    const filtered = useInvoiceStore.getState().getFilteredInvoices();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].providerName).toBe('A');
  });

  it('should update taxStatus', async () => {
    const inv = await useInvoiceStore.getState().addInvoice({ providerName: 'Test', date: '2025-02-05', expenseType: 'Combustible', totalAmount: 1000, status: 'pending', taxStatus: 'pending' });
    expect(inv.taxStatus).toBe('pending');

    await useInvoiceStore.getState().updateTaxStatus(inv.id, 'declared');
    const updated = useInvoiceStore.getState().invoices.find(i => i.id === inv.id);
    expect(updated?.taxStatus).toBe('declared');
  });

  it('should filter by taxStatus', async () => {
    await useInvoiceStore.getState().addInvoice({ providerName: 'A', date: '2025-02-05', expenseType: 'Combustible', totalAmount: 1000, status: 'pending', taxStatus: 'pending' });
    await useInvoiceStore.getState().addInvoice({ providerName: 'B', date: '2025-02-10', expenseType: 'Combustible', totalAmount: 2000, status: 'pending', taxStatus: 'declared' });

    useInvoiceStore.getState().setFilters({ taxStatus: 'declared' });
    const filtered = useInvoiceStore.getState().getFilteredInvoices();
    expect(filtered).toHaveLength(1);
    expect(filtered[0].providerName).toBe('B');
  });
});