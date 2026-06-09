// Global test types - ambient module declarations for test imports
declare module '*utils/rutValidator' {
  export function cleanRut(rut: string): string;
  export function formatRut(rut: string): string;
  export function validateRut(rut: string): boolean;
}

declare module '*utils/formatters' {
  export function formatCurrency(amount: number): string;
  export function formatDate(dateStr: string): string;
  export function formatDateTime(dateStr: string): string;
  export function getMonthName(month: number): string;
  export function getStatusLabel(status: string): string;
  export function getStatusVariant(status: string): string;
}

declare module '*utils/calculations' {
  export function getInvoicesForMonth(invoices: any[], year: number, month: number): any[];
  export function generateCategorySummary(invoices: any[]): any[];
  export function buildYearMonths(invoices: any[], year: number): any[];
  export function generateMonthlySummary(invoices: any[]): any[];
}

declare module '*store/invoiceStore' {
  import { StoreApi, UseBoundStore } from 'zustand';
  interface Invoice {
    id: string;
    providerName: string;
    providerRut: string;
    documentType: string;
    documentNumber: string;
    date: string;
    detail: string;
    expenseType: string;
    netAmount: number;
    totalBoletaServicios: number;
    totalBoletaHonorarios: number;
    specificTax: number;
    ivaAmount: number;
    totalAmount: number;
    status: 'pending' | 'reviewed' | 'approved';
    taxStatus: 'pending' | 'reviewed' | 'declared';
    notes: string;
    createdAt: string;
    updatedAt: string;
  }
  interface InvoiceStore {
    invoices: Invoice[];
    filters: Record<string, any>;
    isLoading: boolean;
    error: string | null;
    loadInvoices: () => Promise<void>;
    addInvoice: (data: any, imageFile?: File) => Promise<Invoice>;
    updateInvoice: (id: string, updates: Partial<Invoice>) => Promise<Invoice>;
    deleteInvoice: (id: string) => Promise<void>;
    setFilters: (filters: Record<string, any>) => void;
    clearFilters: () => void;
    getFilteredInvoices: () => Invoice[];
    clearError: () => void;
    updateTaxStatus: (id: string, status: 'pending' | 'reviewed' | 'declared') => Promise<void>;
  }
  const useInvoiceStore: UseBoundStore<StoreApi<InvoiceStore>>;
  export default useInvoiceStore;
}