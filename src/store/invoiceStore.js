import { create } from 'zustand';
import { getStorageProvider } from '../services/storage/StorageProvider';

const useInvoiceStore = create((set, get) => ({
  invoices: [],
  batchInvoices: [],
  filters: {},
  isLoading: false,
  error: null,

  setBatchInvoices: (batchInvoices) => set({ batchInvoices }),
  clearBatchInvoices: () => set({ batchInvoices: [] }),

  /**
   * Carga todos los comprobantes desde el provider de almacenamiento.
   */
  loadInvoices: async () => {
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      await storage.initialize();
      const invoices = await storage.getAll();
      set({ invoices, isLoading: false });
    } catch (err) {
      set({ error: err.message || 'Error al cargar comprobantes', isLoading: false });
    }
  },

  /**
   * Agrega un nuevo comprobante.
   */
  addInvoice: async (invoiceData, imageFile = null) => {
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      const newInvoice = await storage.save(invoiceData);

      if (imageFile) {
        await storage.saveImage(newInvoice.id, imageFile);
      }

      set((state) => ({
        invoices: [newInvoice, ...state.invoices].sort((a, b) =>
          b.date > a.date ? 1 : b.date < a.date ? -1 : 0
        ),
        isLoading: false,
      }));
      return newInvoice;
    } catch (err) {
      set({ error: err.message || 'Error al guardar', isLoading: false });
      throw err;
    }
  },

  /**
   * Actualiza un comprobante existente.
   */
  updateInvoice: async (id, updates) => {
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      const updated = await storage.update(id, updates);
      set((state) => ({
        invoices: state.invoices
          .map((inv) => (inv.id === id ? updated : inv))
          .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)),
        isLoading: false,
      }));
      return updated;
    } catch (err) {
      set({ error: err.message || 'Error al actualizar', isLoading: false });
      throw err;
    }
  },

  /**
   * Elimina un comprobante.
   */
  deleteInvoice: async (id) => {
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      await storage.delete(id);
      set((state) => ({
        invoices: state.invoices.filter((inv) => inv.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      set({ error: err.message || 'Error al eliminar', isLoading: false });
      throw err;
    }
  },

  /**
   * Actualiza el estado tributario de un comprobante.
   */
  updateTaxStatus: async (id, taxStatus) => {
    return get().updateInvoice(id, { taxStatus });
  },

  /**
   * Establece filtros.
   */
  setFilters: (newFilters) => {
    set((state) => ({ filters: { ...state.filters, ...newFilters } }));
  },

  /**
   * Limpia todos los filtros.
   */
  clearFilters: () => {
    set({ filters: {} });
  },

  /**
   * Retorna comprobantes filtrados según filtros activos.
   */
  getFilteredInvoices: () => {
    const { invoices, filters } = get();
    return invoices.filter((inv) => {
      if (filters.month !== undefined) {
        const m = new Date(inv.date).getMonth() + 1;
        if (m !== filters.month) return false;
      }
      if (filters.months !== undefined) {
        const m = new Date(inv.date).getMonth() + 1;
        if (!filters.months.includes(m)) return false;
      }
      if (filters.year !== undefined) {
        const y = new Date(inv.date).getFullYear();
        if (y !== filters.year) return false;
      }
      if (filters.expenseType && inv.expenseType !== filters.expenseType) return false;
      if (filters.status && inv.status !== filters.status) return false;
      if (filters.taxStatus && (inv.taxStatus || 'pending') !== filters.taxStatus) return false;
      if (filters.providerSearch && filters.providerSearch.trim()) {
        const search = filters.providerSearch.toLowerCase().trim();
        if (!inv.providerName.toLowerCase().includes(search)) return false;
      }
      if (filters.documentType && inv.documentType !== filters.documentType) return false;
      return true;
    });
  },

  clearError: () => set({ error: null }),
}));

export default useInvoiceStore;
