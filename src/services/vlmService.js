import logger from '../utils/logger';
import { EXPENSE_TYPES } from '../data/expenseTypes';
import { validateRut } from '../utils/rutValidator';
import { supabase } from './supabaseClient';

/**
 * Servicio de extracción con IA (modelos de visión).
 *
 * La extracción pasa siempre por el backend propio (POST /api/extract): la
 * API key del proveedor (Gemini/OpenAI) vive solo en el servidor, el consumo
 * queda registrado por usuario y los límites del plan se aplican ahí.
 */

/**
 * Convierte un File/Blob a base64.
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      // Extraer solo la parte base64 (sin el prefijo data:...)
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Intenta parsear JSON de la respuesta del modelo.
 * El modelo a veces envuelve el JSON en markdown.
 */
function tryParseJson(raw) {
  if (!raw) return null;

  // Intentar directo
  try {
    return JSON.parse(raw);
  } catch {
    // Intentar extraer bloque JSON
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Valida los datos extraídos por la IA aplicando reglas de negocio chilenas.
 */
export function validateExtractedData(data) {
  const errors = [];

  // 1. RUT válido (dígito verificador chileno)
  if (!data.providerRut) {
    errors.push('Falta el RUT del proveedor o emisor.');
  } else if (!validateRut(data.providerRut)) {
    errors.push(`RUT del proveedor inválido: "${data.providerRut}"`);
  }

  // 2. neto + IVA = total (para facturas/NC)
  const isInvoiceOrNC = ['Factura', 'Factura Electrónica', 'Nota de Crédito'].includes(data.documentType);
  if (isInvoiceOrNC) {
    const net = Number(data.netAmount) || 0;
    const iva = Number(data.ivaAmount) || 0;
    const total = Number(data.totalAmount) || 0;
    const sum = net + iva;
    if (Math.abs(sum - total) > 2) {
      errors.push(`Cálculo de montos inconsistente para Factura/NC: Neto (${net}) + IVA (${iva}) = ${sum}, pero el Total es ${total}.`);
    }
  }

  // 3. totalBoletaServicios/Honorarios > 0 si corresponde
  const isBoleta = ['Boleta', 'Boleta Electrónica'].includes(data.documentType);
  if (isBoleta) {
    const totalBoletaServicios = Number(data.totalBoletaServicios) || 0;
    if (totalBoletaServicios <= 0) {
      errors.push(`Para Boletas, el campo "totalBoletaServicios" debe ser mayor a 0 (actual: ${totalBoletaServicios}).`);
    }
  }

  const isHonorarios = data.documentType === 'Boleta de Honorarios';
  if (isHonorarios) {
    const totalBoletaHonorarios = Number(data.totalBoletaHonorarios) || 0;
    if (totalBoletaHonorarios <= 0) {
      errors.push(`Para Boletas de Honorarios, el campo "totalBoletaHonorarios" debe ser mayor a 0 (actual: ${totalBoletaHonorarios}).`);
    }
  }

  // 4. fecha <= hoy, montos >= 0
  if (!data.date) {
    errors.push('Falta la fecha del documento.');
  } else {
    // Validar formato YYYY-MM-DD
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(data.date)) {
      errors.push(`Formato de fecha inválido (debe ser YYYY-MM-DD): "${data.date}"`);
    } else {
      const docDate = new Date(data.date + 'T00:00:00');
      const today = new Date();
      // Remover horas de hoy
      today.setHours(23, 59, 59, 999);
      if (isNaN(docDate.getTime())) {
        errors.push(`Fecha no válida: "${data.date}"`);
      } else if (docDate > today) {
        errors.push(`La fecha del documento no puede ser futura: "${data.date}"`);
      }
    }
  }

  // Validar montos no negativos
  const numericFields = ['netAmount', 'totalBoletaServicios', 'totalBoletaHonorarios', 'specificTax', 'ivaAmount', 'totalAmount'];
  for (const field of numericFields) {
    if (data[field] !== undefined && data[field] !== null) {
      const val = Number(data[field]);
      if (isNaN(val) || val < 0) {
        errors.push(`El monto "${field}" no puede ser negativo ni inválido (actual: ${data[field]}).`);
      }
    }
  }

  // 5. expenseType en EXPENSE_TYPES
  if (!data.expenseType) {
    errors.push('Falta el tipo de gasto (expenseType).');
  } else if (!EXPENSE_TYPES.includes(data.expenseType)) {
    errors.push(`El tipo de gasto "${data.expenseType}" no se encuentra entre las categorías válidas.`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Camino normal: extracción vía backend propio (/api/extract).
 * La sesión del usuario autentica la llamada; la key del proveedor
 * nunca llega al navegador.
 */
async function extractWithBackend(base64Image, mimeType, feedback = '') {
  if (!supabase) {
    throw new Error('La extracción con IA requiere una cuenta. Inicia sesión o configura tu propia API Key en Opciones avanzadas.');
  }
  const { data: { session } = {} } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Debes iniciar sesión para usar la extracción con IA.');
  }

  const response = await fetch('/api/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ imageBase64: base64Image, mimeType, feedback }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'El servicio de extracción no está disponible en este momento.');
  }
  return data.text || '';
}

/** Normaliza los campos del JSON extraído (expenseType difuso + numéricos). */
function normalizeExtracted(parsed) {
  // Match inteligente/parcial para expenseType
  if (parsed.expenseType && !EXPENSE_TYPES.includes(parsed.expenseType)) {
    const lower = parsed.expenseType.toLowerCase();
    const match = EXPENSE_TYPES.find((t) => t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase()));
    parsed.expenseType = match || '';
  }
  // Asegurar que todos los campos numéricos son números
  const numericFields = ['netAmount', 'totalBoletaServicios', 'totalBoletaHonorarios', 'specificTax', 'ivaAmount', 'totalAmount'];
  for (const field of numericFields) {
    parsed[field] = parsed[field] == null ? 0 : (Number(parsed[field]) || 0);
  }
  return parsed;
}

/**
 * Servicio principal de extracción VLM.
 *
 * Filosofía: extraer → REVISAR → guardar. Por eso, si el modelo devuelve un
 * JSON legible pero algún campo de negocio no cumple la validación (ej. no
 * pudo leer el RUT en una foto arrugada), NO se descarta la boleta: se
 * reintenta una vez con feedback y, si sigue incompleta, se entrega lo
 * extraído para que el usuario lo corrija en Revisión (donde esos mismos
 * campos se validan y resaltan). Antes se tiraba error y la boleta se perdía.
 *
 * Los errores de red/proveedor (rate limit, saturación) se propagan tal cual
 * para que la cola de subida los maneje (esperar y reintentar sola).
 */
export async function extractInvoiceData(imageFile) {
  const base64Image = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  const maxAttempts = 2; // 1 intento + 1 reintento con feedback
  let feedback = '';
  let lastParsed = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    logger.debug(`[VLM Service] Intento ${attempt}/${maxAttempts} de extracción para: ${imageFile.name}`);

    // Los errores de esta llamada (rate limit, 5xx, sin sesión) se propagan:
    // la cola de subida decide si esperar y reintentar o marcar error.
    const rawResponse = await extractWithBackend(base64Image, mimeType, feedback);

    const parsed = tryParseJson(rawResponse);
    if (!parsed) {
      // Respuesta no interpretable: sí vale la pena reintentar, pero si tras
      // los intentos sigue sin ser JSON, no hay nada que llevar a revisión.
      logger.error(`[VLM Service] [Intento ${attempt}] Respuesta no JSON:`, rawResponse);
      feedback = 'La respuesta anterior no era un JSON válido. Responde estrictamente con JSON válido, sin texto extra.';
      if (attempt >= maxAttempts) {
        throw new Error('No se pudo interpretar la respuesta de la IA. Verifica que la foto sea legible e inténtalo de nuevo.');
      }
      continue;
    }

    lastParsed = normalizeExtracted(parsed);

    const validation = validateExtractedData(lastParsed);
    if (validation.isValid) {
      logger.debug(`[VLM Service] [Intento ${attempt}] Extracción validada.`);
      return lastParsed;
    }

    // Reglas de negocio incumplidas (RUT faltante, montos, tipo de gasto…):
    // un reintento con feedback y, si persiste, se entrega parcial a Revisión.
    logger.warn(`[VLM Service] [Intento ${attempt}] Validación incompleta:`, validation.errors);
    feedback = validation.errors.map((err, i) => `${i + 1}. ${err}`).join('\n');
    if (attempt >= maxAttempts) {
      logger.warn('[VLM Service] Extracción parcial → pasa a Revisión para corregir.');
      return lastParsed;
    }
  }

  return lastParsed;
}
