import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import { exportRendicionPackage } from './templateExport';
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

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(data);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Comprobantes', 'Resumen Mensual', 'Resumen por Gasto']);

    const ws = wb.worksheets[0];
    // Encabezado + 2 comprobantes
    expect(ws.rowCount).toBe(3);
    expect(ws.getCell('A1').value).toBe('Nombre Proveedor');
    expect(ws.getCell('A2').value).toBe('Sodimac');
    // Columna M = 'Total'
    expect(ws.getCell('M1').value).toBe('Total');
    expect(ws.getCell('M2').value).toBe(1190);
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

describe('complete export packages',()=>{
  it.each([25,26,100])('exports all %i IDs without truncation',async(count)=>{
    const template=await makeTemplate();
    const docs=Array.from({length:count},(_,i)=>({...invoices[0],id:'id-'+i,documentNumber:String(i+1)}));
    const result=await exportRendicionPackage(docs,template,{nombre:'Empresa'},null);
    const zip=await JSZip.loadAsync(result.buffer);
    const index=JSON.parse(await zip.file('indice.json')!.async('string'));
    expect(index.parts.flatMap((p:any)=>p.invoiceIds)).toEqual(docs.map(d=>d.id));
    expect(index.parts).toHaveLength(Math.ceil(count/25));
    let exported=0;
    for(const part of index.parts){
      const wb=new ExcelJS.Workbook();await wb.xlsx.load(await zip.file(part.filename)!.async('arraybuffer'));
      for(let row=21;row<=45;row++)if(wb.worksheets[0].getCell('A'+row).value)exported++;
    }
    expect(exported).toBe(count);
  });
  it('refuses the single-sheet function when rows would be dropped',async()=>{
    await expect(exportToRendicion(Array(26).fill(invoices[0]),await makeTemplate())).rejects.toThrow('25');
  });
  it('preserves unrelated binary/XML parts and subtracts credit notes',async()=>{
    const template=await JSZip.loadAsync(await makeTemplate());
    template.file('xl/vbaProject.bin',new Uint8Array([1,2,3,4]));
    template.file('xl/drawings/vmlDrawing1.vml','<xml>unchanged drawing</xml>');
    const result=await exportToRendicion([{...invoices[0],documentType:'Nota de Crédito'}],await template.generateAsync({type:'arraybuffer'}));
    const zip=await JSZip.loadAsync(result);
    expect(await zip.file('xl/vbaProject.bin')!.async('uint8array')).toEqual(new Uint8Array([1,2,3,4]));
    expect(await zip.file('xl/drawings/vmlDrawing1.vml')!.async('string')).toBe('<xml>unchanged drawing</xml>');
    const wb=new ExcelJS.Workbook();await wb.xlsx.load(result);expect(wb.worksheets[0].getCell('H21').value).toBe(-1000);
  });
  it('protects formulas and neutralizes spreadsheet formula injection in CSV',async()=>{
    await expect(exportToRendicion(invoices,await makeTemplate(),{},{providerName:'L'})).rejects.toThrow('fórmulas');
    expect(exportToCSV([{...invoices[0],providerName:'=HYPERLINK("bad")'}])).toContain("'=HYPERLINK");
  });
});
