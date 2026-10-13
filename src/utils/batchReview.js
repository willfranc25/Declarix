import { documentErrors, documentKey, normalizeDocument, withVoucherFolio } from './documentRules';

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
export function deriveRowsFromQueue(queue, savedInvoices = [], savedKeys = []) {
  const saved = new Set([...savedKeys, ...savedInvoices.filter(i => !i.deleted).map(documentKey).filter(Boolean)]);
  const seen = new Set(saved);
  return queue
    .filter((q) => q.status === 'done' && q.extractedData)
    .map((q) => withVoucherFolio({
      id: q.id,
      file: q.file,
      fileName: q.name,
      mimeType: q.mimeType,
      tempPreviewUrl: q.tempPreviewUrl,
      isDuplicate: q.isDuplicate,
      ...q.extractedData,
      ...(q.review || {}),
    }))
    .map(row => {
      const key = documentKey(row);
      const isDuplicate = Boolean(key && seen.has(key));
      if (key) seen.add(key);
      return { ...row, isDuplicate, duplicateKind: isDuplicate ? (saved.has(key) ? 'saved' : 'batch') : null };
    });
}

/** Cuántas boletas siguen en extracción (para el estado "en camino"). */
export function countExtracting(queue) {
  return queue.filter((q) => ['pending', 'processing', 'waiting'].includes(q.status)).length;
}

/**
 * Errores de una fila (objeto campo→mensaje; vacío = lista para guardar).
 * Reglas tributarias chilenas aplicadas en el momento de la revisión.
 */
export const getRowErrors = row => ({
  ...documentErrors(row),
  ...(row.isDuplicate ? { duplicate: row.duplicateKind === 'batch'
    ? 'Este comprobante está repetido en el lote. Conserva una copia o revisa su RUT y folio.'
    : 'Este comprobante ya está guardado en la empresa. Revisa su RUT y folio o descarta esta copia.' } : {}),
});

/** ¿La fila está lista para guardarse (sin errores)? */
export function isRowValid(row) {
  return Object.keys(getRowErrors(row)).length === 0;
}

/**
 * Convierte una fila revisada en el payload del comprobante: quita los
 * metadatos de la cola y normaliza los montos a número.
 */
export function rowToInvoiceData(row) {
  return { ...normalizeDocument(row), source_job_id: row.source_job_id, source_index: row.source_index,
    imagePath: row.imagePath, extracted_original: row.extracted_original };
}
