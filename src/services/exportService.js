import { signedAmount } from '../utils/documentRules';
import { formatDate } from '../utils/formatters';
import { generateMonthlySummary, generateCategorySummary } from '../utils/calculations';

// exceljs pesa ~1 MB minificado: se carga bajo demanda al exportar
// para no inflar el chunk de la página de Reportes.

export { fillTemplate as exportToRendicion, exportRendicionPackage } from './templateExport';

/**
 * Exporta a un Excel nuevo simple (sin plantilla) con todas las columnas.
 * Usa ExcelJS (la dependencia `xlsx` se eliminó por CVEs sin fix en npm).
 */
export async function exportToExcel(invoices, options = {}) {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();

  const addSheet = (name, headers, rows) => {
    const ws = wb.addWorksheet(name);
    ws.addRow(headers);
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(r));
    // Ancho de columna razonable según encabezado
    ws.columns.forEach((col, i) => {
      col.width = Math.max(12, String(headers[i] || '').length + 2);
    });
    return ws;
  };

  addSheet(
    'Comprobantes',
    [
      'Nombre Proveedor', 'RUT Proveedor', 'Tipo Documento', 'N° Documento',
      'Fecha', 'Detalle Compra', 'Tipo de Gasto',
      'Neto', 'Total Boleta Servicios', 'Total Boleta Honorarios',
      'Impuesto Específico', 'IVA', 'Total', 'Estado',
      'Exento', 'Otros impuestos', 'Retenciones', 'RUT receptor', 'Centro de costo', 'Folio de referencia', 'Notas', 'Estado tributario',
    ],
    invoices.map((inv) => [
      inv.providerName, inv.providerRut, inv.documentType, inv.documentNumber,
      formatDate(inv.date), inv.detail, inv.expenseType,
      signedAmount(inv, 'netAmount'), signedAmount(inv, 'totalBoletaServicios'), signedAmount(inv, 'totalBoletaHonorarios'),
      signedAmount(inv, 'specificTax'), signedAmount(inv, 'ivaAmount'), signedAmount(inv, 'totalAmount'), inv.status,
      signedAmount(inv, 'exemptAmount'), signedAmount(inv, 'otherTax'), signedAmount(inv, 'withholdingAmount'), inv.recipientRut, inv.costCenter, inv.referenceNumber, inv.notes, inv.taxStatus,
    ])
  );

  if (options.includeMonthlySheet) {
    const summaries = generateMonthlySummary(invoices);
    addSheet(
      'Resumen Mensual',
      ['Año', 'Mes', 'Comprobantes', 'Neto', 'IVA', 'Impuesto Esp.', 'Total'],
      summaries.map((s) => [s.year, s.month, s.count, s.netAmount, s.ivaAmount, s.specificTax, s.totalAmount])
    );
  }

  if (options.includeCategorySheet) {
    const summaries = generateCategorySummary(invoices);
    addSheet(
      'Resumen por Gasto',
      ['Tipo de Gasto', 'Comprobantes', 'Neto', 'IVA', 'Total'],
      summaries.map((s) => [s.category, s.count, s.netAmount, s.ivaAmount, s.totalAmount])
    );
  }

  const buffer = await wb.xlsx.writeBuffer();
  return buffer;
}

/**
 * Exporta a CSV simple.
 */
export function exportToCSV(invoices) {
  const headers = [
    'Nombre Proveedor', 'RUT Proveedor', 'Tipo Documento', 'N° Documento',
    'Fecha', 'Detalle Compra', 'Tipo de Gasto', 'Neto', 'Total Boleta Servicios',
    'Total Boleta Honorarios', 'Impuesto Específico', 'IVA', 'Total', 'Estado',
    'Exento', 'Otros impuestos', 'Retenciones', 'RUT receptor', 'Centro de costo', 'Folio de referencia', 'Notas', 'Estado tributario',
  ];

  const escape = (v) => {
    let str = v == null ? '' : String(v);
    if (typeof v === 'string' && /^[\s]*[=+@\-\t\r]/.test(str)) str = "'" + str;
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
        signedAmount(inv, 'netAmount'), signedAmount(inv, 'totalBoletaServicios'), signedAmount(inv, 'totalBoletaHonorarios'),
        signedAmount(inv, 'specificTax'), signedAmount(inv, 'ivaAmount'), signedAmount(inv, 'totalAmount'), inv.status,
        signedAmount(inv, 'exemptAmount'), signedAmount(inv, 'otherTax'), signedAmount(inv, 'withholdingAmount'), inv.recipientRut, inv.costCenter, inv.referenceNumber, inv.notes, inv.taxStatus,
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
