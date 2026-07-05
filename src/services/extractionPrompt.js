import { EXPENSE_TYPES } from '../data/expenseTypes.js';

/**
 * Prompt de extracción para modelos de visión (OpenAI GPT-4o, Gemini, etc.).
 * Compartido entre el backend (/api/extract) y el modo avanzado del cliente
 * (API key propia), para que ambos caminos produzcan el mismo formato.
 */
export const EXTRACTION_PROMPT = `Analiza esta imagen de un comprobante chileno (boleta, factura, boleta de honorarios o nota de crédito).

Extrae los datos y responde SOLAMENTE con un JSON válido, sin ningún otro texto ni markdown.

Formato JSON requerido:
{
  "providerName": "nombre del proveedor o emisor",
  "providerRut": "RUT en formato XX.XXX.XXX-X o null",
  "documentType": "Factura|Factura Electrónica|Boleta|Boleta Electrónica|Boleta de Honorarios|Nota de Crédito|Otro",
  "documentNumber": "número del documento o null",
  "date": "YYYY-MM-DD",
  "detail": "descripción breve de la compra/servicio",
  "expenseType": "una de las categorías válidas (ver lista abajo)",
  "netAmount": número o 0,
  "totalBoletaServicios": número o 0,
  "totalBoletaHonorarios": número o 0,
  "specificTax": número o 0,
  "ivaAmount": número o 0,
  "totalAmount": número o 0
}

Reglas de montos:
- Si es FACTURA o NOTA DE CRÉDITO: poner el monto neto en "netAmount", el IVA en "ivaAmount"
- Si es BOLETA normal o de SERVICIOS: poner el total en "totalBoletaServicios", netAmount=0
- Si es BOLETA DE HONORARIOS: poner el total en "totalBoletaHonorarios", netAmount=0
- "specificTax": solo para impuesto específico al combustible u otro impuesto especial separado del IVA
- "totalAmount": siempre el monto total final del documento

Reglas de campos:
- "providerRut": buscar RUT, R.U.T. seguido de números como 12.345.678-9. Debe tener dígito verificador válido.
- "date": convertir DD/MM/YYYY o similar a formato estándar YYYY-MM-DD.
- "detail": describir brevemente qué se compró.
- Retornar null o 0 para campos no visibles en la imagen.

Categorías válidas para "expenseType":
${EXPENSE_TYPES.join(', ')}

Elige la categoría que mejor coincida con el contexto de la compra.`;

/**
 * Construye el prompt final, incorporando el feedback de un intento fallido
 * para que el modelo corrija sus errores en el reintento.
 */
export function buildExtractionPrompt(feedback = '') {
  if (!feedback) return EXTRACTION_PROMPT;
  return `${EXTRACTION_PROMPT}\n\nATENCIÓN: En un intento anterior, la extracción falló por las siguientes razones:\n${feedback}\nPor favor corrige estos errores en esta nueva respuesta y asegúrate de cumplir con todas las reglas de negocio descritas en el prompt.`;
}
