import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { exportToRendicion, exportToExcel, exportToCSV } from '../services/exportService';

const invoices = [
  {
    providerName: 'Sodimac',
    providerRut: '12.345.678-5',
    documentType: 'Factura',
    documentNumber: '100',
    date: '2026-01-15',
    detail: 'Materiales',
    expenseType: 'Materiales de Construccion',
    netAmount: 1000,
    totalBoletaServicios: 0,
    totalBoletaHonorarios: 0,
    specificTax: 0,
    ivaAmount: 190,
    totalAmount: 1190,
    status: 'approved',
  },
  {
    providerName: 'Copec; Estación "Centro"',
    providerRut: '96.511.760-4',
    documentType: 'Boleta',
    documentNumber: '200',
    date: '2026-02-20',
    detail: 'Combustible',
    expenseType: 'Combustible',
    netAmount: 0,
    totalBoletaServicios: 25000,
    totalBoletaHonorarios: 0,
    specificTax: 1200,
    ivaAmount: 0,
    totalAmount: 25000,
    status: 'pending',
  },
];

/** Crea una plantilla mínima con hoja "base" y una fórmula en columna L. */
async function makeTemplate(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('base');
  ws.getCell('B12').value = 'FECHA_PLACEHOLDER';
  // Columna L tiene fórmulas que la exportación NO debe tocar
  ws.getCell('L21').value = { formula: 'H21*2', result: 0 };
  ws.getCell('A21').value = 'DATO_VIEJO';
  const buffer = await wb.xlsx.writeBuffer();
  return buffer as ArrayBuffer;
}

describe('exportToRendicion', () => {
  it('escribe los datos según el mapping y preserva las fórmulas de la plantilla', async () => {
    const template = await makeTemplate();
    const result = await exportToRendicion(invoices, template, {
      fechaRendicion: '05-07-2026',
      rut: '12.345.678-5',
    });

    const out = new ExcelJS.Workbook();
    await out.xlsx.load(result);
    const ws = out.worksheets.find((s) => s.name === 'base')!;

    // Encabezado
    expect(ws.getCell('B12').value).toBe('05-07-2026');
    // Fila 21 = primer comprobante (mapping por defecto A..K)
    expect(ws.getCell('A21').value).toBe('Sodimac');
    expect(ws.getCell('B21').value).toBe('12.345.678-5');
    expect(ws.getCell('H21').value).toBe(1000);
    // Fila 22 = segundo comprobante
    expect(ws.getCell('I22').value).toBe(25000);
    expect(ws.getCell('K22').value).toBe(1200);
    // Fila 23 sin datos: se limpia
    expect(ws.getCell('A23').value).toBeNull();
    // La fórmula de la columna L sigue intacta
    const formulaCell = ws.getCell('L21').value as { formula?: string };
    expect(formulaCell?.formula).toBe('H21*2');
  });

  it('respeta un mapping personalizado e ignora campos sin columna', async () => {
    const template = await makeTemplate();
    const result = await exportToRendicion([invoices[0]], template, {}, {
      providerName: 'C',
      netAmount: 'D',
      // el resto de campos se ignora
    });

    const out = new ExcelJS.Workbook();
    await out.xlsx.load(result);
    const ws = out.worksheets.find((s) => s.name === 'base')!;

    expect(ws.getCell('C21').value).toBe('Sodimac');
    expect(ws.getCell('D21').value).toBe(1000);
    // La columna A del mapping por defecto no se usa con mapping custom
    expect(ws.getCell('B21').value).toBeNull();
  });
});

describe('exportToExcel', () => {
  it('genera un xlsx con hoja principal y resúmenes', async () => {
    const data = await exportToExcel(invoices, {
      includeMonthlySheet: true,
      includeCategorySheet: true,
    });

    const wb = XLSX.read(data, { type: 'array' });
    expect(wb.SheetNames).toEqual(['Comprobantes', 'Resumen Mensual', 'Resumen por Gasto']);

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Comprobantes']);
    expect(rows).toHaveLength(2);
    expect(rows[0]['Nombre Proveedor']).toBe('Sodimac');
    expect(rows[0]['Total']).toBe(1190);
  });
});

describe('exportToCSV', () => {
  it('separa con punto y coma y escapa valores con caracteres especiales', () => {
    const csv = exportToCSV(invoices);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('Nombre Proveedor;RUT Proveedor');
    // El nombre con ; y comillas queda escapado entre comillas dobles
    expect(lines[2]).toContain('"Copec; Estación ""Centro"""');
  });
});
