import { validateRut } from './rutValidator';

/**
 * Lógica pura del flujo de Revisión en lote (BatchReview), extraída para
 * poder testearla sin renderizar la página:
 *  - derivar las filas de revisión desde la cola de subida,
 *  - validar cada fila antes de guardar,
 *  - convertir una fila revisada en el payload del comprobante.
 */

const INVOICE_OR_NC = ['Factura', 'Factura Electrónica', 'Nota de Crédito'];
const BOLETA_TYPES = ['Boleta', 'Boleta Electrónica'];

// Metadatos de la cola/revisión que NO son campos del comprobante
const ROW_META_KEYS = ['id', 'file', 'fileName', 'tempPreviewUrl', 'isDuplicate'];
const AMOUNT_KEYS = ['netAmount', 'ivaAmount', 'totalAmount', 'totalBoletaServicios', 'totalBoletaHonorarios', 'specificTax'];

/**
 * Filas de revisión derivadas de la cola: solo los items extraídos ('done'),
 * fusionando los datos de la IA con las correcciones del usuario (`review`).
 * Es la fuente única de la pantalla, por eso una boleta recién extraída
 * aparece sola sin snapshots.
 */
export function deriveRowsFromQueue(queue) {
  return queue
    .filter((q) => q.status === 'done' && q.extractedData)
    .map((q) => ({
      id: q.id,
      file: q.file,
      fileName: q.name,
      tempPreviewUrl: q.tempPreviewUrl,
      isDuplicate: q.isDuplicate,
      ...q.extractedData,
      ...(q.review || {}),
    }));
}

/** Cuántas boletas siguen en extracción (para el estado "en camino"). */
export function countExtracting(queue) {
  return queue.filter((q) => ['pending', 'processing', 'waiting'].includes(q.status)).length;
}

/**
 * Errores de una fila (objeto campo→mensaje; vacío = lista para guardar).
 * Reglas tributarias chilenas aplicadas en el momento de la revisión.
 */
export function getRowErrors(row) {
  const errors = {};

  if (!row.providerRut) {
    errors.providerRut = 'Falta RUT';
  } else if (!validateRut(row.providerRut)) {
    errors.providerRut = 'RUT inválido';
  }

  if (INVOICE_OR_NC.includes(row.documentType)) {
    const net = Number(row.netAmount) || 0;
    const iva = Number(row.ivaAmount) || 0;
    const total = Number(row.totalAmount) || 0;
    if (Math.abs(net + iva - total) > 2) {
      errors.amounts = 'Neto + IVA ≠ Total';
    }
  }

  if (BOLETA_TYPES.includes(row.documentType)) {
    if ((Number(row.totalBoletaServicios) || 0) <= 0 && (Number(row.totalAmount) || 0) <= 0) {
      errors.totalBoletaServicios = 'Total debe ser > 0';
    }
  }

  if (row.documentType === 'Boleta de Honorarios') {
    if ((Number(row.totalBoletaHonorarios) || 0) <= 0 && (Number(row.totalAmount) || 0) <= 0) {
      errors.totalBoletaHonorarios = 'Honorarios debe ser > 0';
    }
  }

  if (!row.date) {
    errors.date = 'Falta fecha';
  } else {
    const d = new Date(row.date + 'T00:00:00');
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (isNaN(d.getTime())) {
      errors.date = 'Fecha inválida';
    } else if (d > today) {
      errors.date = 'Fecha futura';
    }
  }

  if (!row.expenseType) {
    errors.expenseType = 'Falta tipo gasto';
  }

  return errors;
}

/** ¿La fila está lista para guardarse (sin errores)? */
export function isRowValid(row) {
  return Object.keys(getRowErrors(row)).length === 0;
}

/**
 * Convierte una fila revisada en el payload del comprobante: quita los
 * metadatos de la cola y normaliza los montos a número.
 */
export function rowToInvoiceData(row) {
  const invoiceData = {};
  for (const key of Object.keys(row)) {
    if (!ROW_META_KEYS.includes(key)) invoiceData[key] = row[key];
  }
  for (const key of AMOUNT_KEYS) {
    invoiceData[key] = Number(invoiceData[key]) || 0;
  }
  return invoiceData;
}
