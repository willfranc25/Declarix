// Type declarations for existing JS modules
declare module '../utils/rutValidator' {
  export function cleanRut(rut: string): string;
  export function formatRut(rut: string): string;
  export function validateRut(rut: string): boolean;
}

declare module '../utils/formatters' {
  export function formatCurrency(amount: number): string;
  export function formatDate(dateStr: string): string;
  export function formatDateTime(dateStr: string): string;
  export function getMonthName(month: number): string;
  export function getStatusLabel(status: string): string;
  export function getStatusVariant(status: string): string;
}

declare module '../utils/calculations' {
  export function getInvoicesForMonth(invoices: any[], year: number, month: number): any[];
  export function generateCategorySummary(invoices: any[]): any[];
  export function buildYearMonths(invoices: any[], year: number): any[];
  export function generateMonthlySummary(invoices: any[]): any[];
}

declare module '../data/expenseTypes' {
  export const EXPENSE_TYPES: string[];
  export const DOCUMENT_TYPES: string[];
}

declare module '../store/invoiceStore' {
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

declare module '../services/vlmService' {
  export interface ExtractedInvoiceData {
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
  }
  export function extractInvoiceData(imageFile: File): Promise<ExtractedInvoiceData>;
}

declare module '../services/storage/StorageProvider' {
  export interface StorageProvider {
    initialize: (sampleData?: any[]) => Promise<void>;
    getAll: () => Promise<any[]>;
    getById: (id: string) => Promise<any | null>;
    save: (data: any) => Promise<any>;
    update: (id: string, updates: any) => Promise<any>;
    delete: (id: string) => Promise<void>;
    saveImage: (id: string, blob: Blob) => Promise<void>;
    getImage: (id: string) => Promise<Blob | null>;
    deleteImage: (id: string) => Promise<void>;
    getSetting: (key: string) => Promise<any>;
    saveSetting: (key: string, value: any) => Promise<void>;
    clearAll: () => Promise<void>;
    importInvoice: (invoice: any) => Promise<void>;
  }
  export function getStorageProvider(): StorageProvider;
}