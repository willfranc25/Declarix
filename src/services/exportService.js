import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import { formatDate } from '../utils/formatters';
import { generateMonthlySummary, generateCategorySummary } from '../utils/calculations';

/**
 * Exporta comprobantes al formato de rendición Saludent usando la plantilla.
 *
 * Estrategia:
 * 1. Leer la plantilla usando ExcelJS para preservar todo el formato, macros, y logos.
 * 2. Escribir datos SOLO en filas 20-44, columnas A-K
 * 3. NO tocar columnas L, M, N (tienen fórmulas)
 * 4. Generar y descargar el archivo
 *
 * @param {Array} invoices - Comprobantes a exportar
 * @param {ArrayBuffer} templateBuffer - Buffer del archivo template
 * @param {Object} headerData - Datos del encabezado
 */
export async function exportToRendicion(invoices, templateBuffer, headerData = {}, customMapping = null) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  // Buscar la hoja llamada "base" (ignorando mayúsculas/minúsculas) o usar la segunda hoja por defecto
  let targetWs = workbook.worksheets.find(s => s.name.toLowerCase() === 'base') || workbook.worksheets[1] || workbook.worksheets[0];

  // Actualizar campos del encabezado si se proporcionan
  if (headerData.fechaRendicion) {
    targetWs.getCell('B12').value = headerData.fechaRendicion;
  }
  if (headerData.nombre) {
    targetWs.getCell('B13').value = headerData.nombre;
  }
  if (headerData.rut) {
    targetWs.getCell('B14').value = headerData.rut;
  }

  // Mapeo por defecto si no se entrega uno personalizado
  const mapping = customMapping || {
    providerName: 'A',
    providerRut: 'B',
    documentType: 'C',
    documentNumber: 'D',
    date: 'E',
    detail: 'F',
    expenseType: 'G',
    netAmount: 'H',
    totalBoletaServicios: 'I',
    totalBoletaHonorarios: 'J',
    specificTax: 'K'
  };

  // Escribir datos en filas 21-45 (1-indexed en ExcelJS)
  const maxRows = 25;
  const startRow = 21;

  for (let i = 0; i < maxRows; i++) {
    const rowNum = startRow + i;
    const inv = invoices[i];

    if (inv) {
      if (mapping.providerName) targetWs.getCell(`${mapping.providerName}${rowNum}`).value = inv.providerName || '';
      if (mapping.providerRut) targetWs.getCell(`${mapping.providerRut}${rowNum}`).value = inv.providerRut || '';
      if (mapping.documentType) targetWs.getCell(`${mapping.documentType}${rowNum}`).value = inv.documentType || '';
      if (mapping.documentNumber) targetWs.getCell(`${mapping.documentNumber}${rowNum}`).value = String(inv.documentNumber || '');
      if (mapping.date) targetWs.getCell(`${mapping.date}${rowNum}`).value = formatDate(inv.date) || '';
      if (mapping.detail) targetWs.getCell(`${mapping.detail}${rowNum}`).value = inv.detail || '';
      if (mapping.expenseType) targetWs.getCell(`${mapping.expenseType}${rowNum}`).value = inv.expenseType || '';
      if (mapping.netAmount) targetWs.getCell(`${mapping.netAmount}${rowNum}`).value = Number(inv.netAmount) || 0;
      if (mapping.totalBoletaServicios) targetWs.getCell(`${mapping.totalBoletaServicios}${rowNum}`).value = Number(inv.totalBoletaServicios) || 0;
      if (mapping.totalBoletaHonorarios) targetWs.getCell(`${mapping.totalBoletaHonorarios}${rowNum}`).value = Number(inv.totalBoletaHonorarios) || 0;
      if (mapping.specificTax) targetWs.getCell(`${mapping.specificTax}${rowNum}`).value = Number(inv.specificTax) || 0;
    } else {
      // Limpiar celdas sin romper las fórmulas
      Object.values(mapping).forEach(colLetter => {
        if (colLetter && typeof colLetter === 'string') {
          targetWs.getCell(`${colLetter.toUpperCase()}${rowNum}`).value = null;
        }
      });
    }
  }

  // Generar el archivo final
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Exporta a un Excel nuevo simple (sin plantilla) con todas las columnas.
 */
export function exportToExcel(invoices, options = {}) {
  const wb = XLSX.utils.book_new();

  // Hoja principal
  const headers = [
    'Nombre Proveedor', 'RUT Proveedor', 'Tipo Documento', 'N° Documento',
    'Fecha', 'Detalle Compra', 'Tipo de Gasto',
    'Neto', 'Total Boleta Servicios', 'Total Boleta Honorarios',
    'Impuesto Específico', 'IVA', 'Total', 'Estado',
  ];

  const rows = [headers];
  for (const inv of invoices) {
    rows.push([
      inv.providerName, inv.providerRut, inv.documentType, inv.documentNumber,
      formatDate(inv.date), inv.detail, inv.expenseType,
      inv.netAmount || 0, inv.totalBoletaServicios || 0, inv.totalBoletaHonorarios || 0,
      inv.specificTax || 0, inv.ivaAmount || 0, inv.totalAmount || 0, inv.status,
    ]);
  }

  const mainSheet = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, mainSheet, 'Comprobantes');

  if (options.includeMonthlySheet) {
    const summaries = generateMonthlySummary(invoices);
    const mHeaders = ['Año', 'Mes', 'Comprobantes', 'Neto', 'IVA', 'Impuesto Esp.', 'Total'];
    const mRows = [mHeaders, ...summaries.map((s) => [s.year, s.month, s.count, s.netAmount, s.ivaAmount, s.specificTax, s.totalAmount])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(mRows), 'Resumen Mensual');
  }

  if (options.includeCategorySheet) {
    const summaries = generateCategorySummary(invoices);
    const cHeaders = ['Tipo de Gasto', 'Comprobantes', 'Neto', 'IVA', 'Total'];
    const cRows = [cHeaders, ...summaries.map((s) => [s.category, s.count, s.netAmount, s.ivaAmount, s.totalAmount])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(cRows), 'Resumen por Gasto');
  }

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new Uint8Array(buffer);
}

/**
 * Exporta a CSV simple.
 */
export function exportToCSV(invoices) {
  const headers = [
    'Nombre Proveedor', 'RUT Proveedor', 'Tipo Documento', 'N° Documento',
    'Fecha', 'Detalle Compra', 'Tipo de Gasto', 'Neto', 'Total Boleta Servicios',
    'Total Boleta Honorarios', 'Impuesto Específico', 'IVA', 'Total', 'Estado',
  ];

  const escape = (v) => {
    const str = v == null ? '' : String(v);
    return str.includes(';') || str.includes('"') || str.includes('\n')
      ? `"${str.replace(/"/g, '""')}"`
      : str;
  };

  const rows = [
    headers.join(';'),
    ...invoices.map((inv) =>
      [
        inv.providerName, inv.providerRut, inv.documentType, inv.documentNumber,
        formatDate(inv.date), inv.detail, inv.expenseType,
        inv.netAmount || 0, inv.totalBoletaServicios || 0, inv.totalBoletaHonorarios || 0,
        inv.specificTax || 0, inv.ivaAmount || 0, inv.totalAmount || 0, inv.status,
      ]
        .map(escape)
        .join(';')
    ),
  ];

  return rows.join('\n');
}

/**
 * Descarga un archivo generado.
 */
export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
