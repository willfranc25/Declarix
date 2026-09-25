import { describe, it, expect } from 'vitest';
import {
  deriveRowsFromQueue,
  countExtracting,
  getRowErrors,
  isRowValid,
  rowToInvoiceData,
} from '../utils/batchReview';

const VALID_RUT = '12.345.678-5';

const validBoletaData = {
  providerName: 'Sodimac',
  providerRut: VALID_RUT,
  documentType: 'Boleta',
  documentNumber: '100',
  date: '2026-01-15',
  expenseType: 'Materiales de Construccion',
  netAmount: 0,
  ivaAmount: 0,
  totalAmount: 11900,
  totalBoletaServicios: 11900,
  totalBoletaHonorarios: 0,
  specificTax: 0,
};

describe('deriveRowsFromQueue', () => {
  it('solo toma items extraídos (done con extractedData) y fusiona las correcciones', () => {
    const queue = [
      { id: '1', status: 'done', name: 'a.jpg', file: 'blob-a', tempPreviewUrl: 'url-a', isDuplicate: false, extractedData: { ...validBoletaData }, review: null },
      { id: '2', status: 'processing', name: 'b.jpg', extractedData: null },      // en extracción → fuera
      { id: '3', status: 'done', name: 'c.jpg', extractedData: null },            // done sin datos → fuera
      { id: '4', status: 'done', name: 'd.jpg', file: 'blob-d', tempPreviewUrl: 'url-d', isDuplicate: true,
        extractedData: { ...validBoletaData, providerName: 'IA dijo esto' },
        review: { providerName: 'Corregido a mano' } },                          // review pisa a la IA
    ];
    const rows = deriveRowsFromQueue(queue);
    expect(rows.map((r) => r.id)).toEqual(['1', '4']);
    expect(rows[0].fileName).toBe('a.jpg');           // q.name → fileName
    expect(rows[1].providerName).toBe('Corregido a mano'); // review tiene prioridad
    expect(rows[1].isDuplicate).toBe(true);
  });
});

describe('countExtracting', () => {
  it('cuenta pending + processing + waiting', () => {
    const queue = [
      { id: '1', status: 'done' },
      { id: '2', status: 'pending' },
      { id: '3', status: 'processing' },
      { id: '4', status: 'waiting' },
      { id: '5', status: 'error' },
    ];
    expect(countExtracting(queue)).toBe(3);
  });
});

describe('getRowErrors', () => {
  it('una boleta consistente no tiene errores', () => {
    expect(getRowErrors(validBoletaData)).toEqual({});
    expect(isRowValid(validBoletaData)).toBe(true);
  });

  it('marca RUT faltante e inválido', () => {
    expect(getRowErrors({ ...validBoletaData, providerRut: '' }).providerRut).toBe('Falta RUT');
    expect(getRowErrors({ ...validBoletaData, providerRut: '12.345.678-0' }).providerRut).toBe('RUT inválido');
  });

  it('factura: neto + IVA debe cuadrar con el total', () => {
    const factura = {
      ...validBoletaData, documentType: 'Factura',
      netAmount: 1000, ivaAmount: 190, totalAmount: 1190, totalBoletaServicios: 0,
    };
    expect(getRowErrors(factura).amounts).toBeUndefined();
    expect(getRowErrors({ ...factura, totalAmount: 5000 }).amounts).toBe('Neto + exento + impuestos − retenciones ≠ Total');
  });

  it('boleta con total 0 se marca', () => {
    const err = getRowErrors({ ...validBoletaData, totalAmount: 0, totalBoletaServicios: 0 });
    expect(err.totalAmount).toBeTruthy();
  });

  it('fecha faltante, futura y tipo de gasto faltante', () => {
    expect(getRowErrors({ ...validBoletaData, date: '' }).date).toBe('Fecha inválida o ausente');
    expect(getRowErrors({ ...validBoletaData, date: '2099-01-01' }).date).toBe('Fecha futura');
    expect(getRowErrors({ ...validBoletaData, expenseType: '' }).expenseType).toBe('Falta tipo de gasto');
  });
});

describe('rowToInvoiceData', () => {
  it('quita metadatos de la cola y normaliza montos a número', () => {
    const row = {
      ...validBoletaData,
      id: 'x', file: 'blob', fileName: 'a.jpg', tempPreviewUrl: 'url', isDuplicate: true,
      netAmount: '0', totalAmount: '11900', // strings desde inputs
    };
    const payload = rowToInvoiceData(row);
    // metadatos fuera
    expect(payload).not.toHaveProperty('id');
    expect(payload).not.toHaveProperty('file');
    expect(payload).not.toHaveProperty('fileName');
    expect(payload).not.toHaveProperty('tempPreviewUrl');
    expect(payload).not.toHaveProperty('isDuplicate');
    // montos numéricos
    expect(payload.totalAmount).toBe(11900);
    expect(typeof payload.totalAmount).toBe('number');
    expect(payload.netAmount).toBe(0);
    // datos del comprobante se conservan
    expect(payload.providerName).toBe('Sodimac');
    expect(payload.providerRut).toBe(VALID_RUT);
  });
});
