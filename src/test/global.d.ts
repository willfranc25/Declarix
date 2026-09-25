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

// Componentes de página / UI usados en tests de integración (.tsx)
declare module '*BatchReviewPage' {
  const Component: () => any;
  export default Component;
}
declare module '*ReportsPage' {
  const Component: () => any;
  export default Component;
}
declare module '*components/ui/Toast' {
  import { ReactNode } from 'react';
  export function ToastProvider(props: { children: ReactNode }): any;
  export function useToast(): { addToast: (message: string, type?: string) => void };
}

declare module '*utils/reportPeriod' {
  export function previousMonthValue(): string;
  export function previousMonth(today?: Date): { month: number; year: number };
  export function computePeriodRange(
    mode: 'month' | 'range' | 'year',
    state: {
      month?: { month: number; year: number };
      rangeFrom?: { month: number; year: number };
      rangeTo?: { month: number; year: number };
      taxYear?: number;
    }
  ): [string, string];
  export function filterInvoicesByPeriod(
    invoices: any[],
    range: [string, string],
    statusChip?: 'all' | 'pending' | 'declared'
  ): any[];
  export function sumInvoiceTotals(
    rows: any[]
  ): { netAmount: number; ivaAmount: number; totalAmount: number };
  export function availableYears(invoices: any[], today?: Date): number[];
}

declare module '*utils/batchReview' {
  export function deriveRowsFromQueue(queue: any[]): any[];
  export function countExtracting(queue: any[]): number;
  export function getRowErrors(row: any): Record<string, string>;
  export function isRowValid(row: any): boolean;
  export function rowToInvoiceData(row: any): Record<string, any>;
}

declare module '*services/vlmService' {
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
  export function validateExtractedData(
    data: Partial<ExtractedInvoiceData>
  ): { isValid: boolean; errors: string[] };
}

declare module '*services/exportService' {
  export function exportToRendicion(
    invoices: any[],
    templateBuffer: ArrayBuffer,
    headerData?: Record<string, any>,
    customMapping?: Record<string, string> | null
  ): Promise<ArrayBuffer>;
  export function exportToExcel(invoices: any[], options?: Record<string, any>): Promise<ArrayBuffer>;
  export function exportToCSV(invoices: any[]): string;
  export function downloadFile(content: any, filename: string, mimeType: string): void;
}

declare module '*templateExport' {
  export function exportRendicionPackage(invoices:any[],buffer:ArrayBuffer,header?:Record<string,any>,mapping?:Record<string,string>|null,options?:Record<string,any>):Promise<{buffer:ArrayBuffer;count:number;parts:number;templateHash:string}>;
}

declare module '*store/uploadQueueStore' {
  import { StoreApi, UseBoundStore } from 'zustand';
  export interface QueueItem {
    id: string;
    file: File;
    name: string;
    size: number;
    status: 'pending' | 'processing' | 'waiting' | 'done' | 'error';
    progress: number;
    error: string | null;
    extractedData: Record<string, any> | null;
    isDuplicate: boolean;
    burstWaits: number;
    tempPreviewUrl: string;
  }
  interface UploadQueueStore {
    reset: () => void;
    flushReviews: () => Promise<void>;
    queue: QueueItem[];
    isProcessing: boolean;
    isHydrated: boolean;
    lastBatchSummary: { at: number; done: number; errors: number; duplicates: number } | null;
    hydrate: () => Promise<void>;
    addFiles: (files: File[]) => Promise<number>;
    updateReview: (id: string, patch: Record<string, any>) => void;
    removeItem: (id: string) => void;
    removeItems: (ids: string[]) => void;
    clearQueue: () => void;
    retryItem: (id: string) => void;
    retryFailed: () => void;
  }
  const useUploadQueueStore: UseBoundStore<StoreApi<UploadQueueStore>>;
  export default useUploadQueueStore;
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
    reset: () => void;
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
declare module '*services/organizationService' {
 export function setActiveOrganization(company: any): void;
 export function getWorkspaceGeneration(): number;
}
declare module '*documentRules' {
 export function civilDate(value: string): {year:number,month:number,day:number} | null;
 export function normalizeDocument(value: any): any;
 export function documentErrors(value: any,today?:string): Record<string,string>;
 export function signedAmount(value:any,field:string): number;
 export function documentKey(value:any): string | null;
}
declare module '*reconciliation' {
 export function reconcileRCV(text:string,invoices:any[]): Array<{status:string;[key:string]:any}>;
}
