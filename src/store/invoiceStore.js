import { getWorkspaceGeneration } from '../services/organizationService';
import { documentErrors } from '../utils/documentRules';
import { create } from 'zustand';
import { getStorageProvider } from '../services/storage/StorageProvider';

const useInvoiceStore = create((set, get) => ({
  invoices: [],
  reset: () => set({invoices: [], filters: {}, isLoading: false, error: null}),
  filters: {},
  isLoading: false,
  error: null,

  /**
   * Carga todos los comprobantes desde el provider de almacenamiento.
   */
  loadInvoices: async () => {
    const generation = getWorkspaceGeneration();
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      await storage.initialize();
      const invoices = await storage.getAll();
      if (generation === getWorkspaceGeneration()) set({ invoices, isLoading: false });
    } catch (err) {
      if (generation === getWorkspaceGeneration()) set({ error: err.message || 'Error al cargar comprobantes', isLoading: false });
    }
  },

  /**
   * Agrega un nuevo comprobante.
   */
  addInvoice: async (invoiceData, imageFile = null) => {
    const generation = getWorkspaceGeneration();
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      if (Object.keys(documentErrors(invoiceData)).length) throw new Error(Object.values(documentErrors(invoiceData)).join(" · "));
      if (imageFile && !invoiceData.source_job_id) throw new Error("Carga el original antes de guardar.");
      const newInvoice = await storage.save(invoiceData);

      if (imageFile && !invoiceData.source_job_id) {
        await storage.saveImage(newInvoice.id, imageFile);
      }

      if (generation === getWorkspaceGeneration()) set((state) => ({
        invoices: [newInvoice, ...state.invoices].sort((a, b) =>
          b.date > a.date ? 1 : b.date < a.date ? -1 : 0
        ),
        isLoading: false,
      }));
      return newInvoice;
    } catch (err) {
      if (generation === getWorkspaceGeneration()) set({ error: err.message || 'Error al guardar', isLoading: false });
      throw err;
    }
  },

  /**
   * Actualiza un comprobante existente.
   */
  updateInvoice: async (id, updates) => {
    const generation = getWorkspaceGeneration();
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      const updated = await storage.update(id, updates);
      if (generation === getWorkspaceGeneration()) set((state) => ({
        invoices: state.invoices
          .map((inv) => (inv.id === id ? updated : inv))
          .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0)),
        isLoading: false,
      }));
      return updated;
    } catch (err) {
      if (generation === getWorkspaceGeneration()) set({ error: err.message || 'Error al actualizar', isLoading: false });
      throw err;
    }
  },

  /**
   * Elimina un comprobante.
   */
  deleteInvoice: async (id) => {
    const generation = getWorkspaceGeneration();
    set({ isLoading: true, error: null });
    try {
      const storage = getStorageProvider();
      await storage.delete(id);
      if (generation === getWorkspaceGeneration()) set((state) => ({
        invoices: state.invoices.filter((inv) => inv.id !== id),
        isLoading: false,
      }));
    } catch (err) {
      if (generation === getWorkspaceGeneration()) set({ error: err.message || 'Error al eliminar', isLoading: false });
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
   * Marca un conjunto de comprobantes como declarados (post-exportación
   * de la rendición). Best-effort: los que fallen quedan pendientes.
   */
  markDeclared: async (ids) => {
    const storage = getStorageProvider();
    const results = await Promise.allSettled(
      ids.map((id) => storage.update(id, { taxStatus: 'declared' }))
    );
    const okIds = new Set(ids.filter((_, i) => results[i].status === 'fulfilled'));
    set((state) => ({
      invoices: state.invoices.map((inv) =>
        okIds.has(inv.id) ? { ...inv, taxStatus: 'declared' } : inv
      ),
    }));
    return okIds.size;
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
        const m = Number(String(inv.date).slice(5, 7));
        if (m !== filters.month) return false;
      }
      if (filters.months !== undefined) {
        const m = Number(String(inv.date).slice(5, 7));
        if (!filters.months.includes(m)) return false;
      }
      if (filters.year !== undefined) {
        const y = Number(String(inv.date).slice(0, 4));
        if (y !== filters.year) return false;
      }
      if (filters.expenseType && inv.expenseType !== filters.expenseType) return false;
      if (filters.taxStatus) {
        // Binario: todo lo que no está declarado cuenta como pendiente
        const isDeclared = inv.taxStatus === 'declared';
        if (filters.taxStatus === 'declared' && !isDeclared) return false;
        if (filters.taxStatus === 'pending' && isDeclared) return false;
      }
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
