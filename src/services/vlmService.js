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

/**
 * Servicio principal de extracción VLM.
 * Llama al backend propio y reintenta automáticamente si falla la validación
 * cruzada de los datos extraídos.
 */
export async function extractInvoiceData(imageFile) {
  const base64Image = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  let attempt = 0;
  let feedback = '';
  let parsed = null;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt++;
    console.log(`[VLM Service] Intento ${attempt}/${maxAttempts} de extracción para: ${imageFile.name}`);

    try {
      const rawResponse = await extractWithBackend(base64Image, mimeType, feedback);

      parsed = tryParseJson(rawResponse);
      if (!parsed) {
        console.error(`[VLM Service] [Intento ${attempt}] Respuesta no JSON:`, rawResponse);
        feedback = `La respuesta recibida no era un JSON válido. Asegúrate de responder estrictamente en formato JSON válido.`;
        if (attempt >= maxAttempts) {
          throw new Error('No se pudo interpretar la respuesta del modelo de IA tras 3 intentos. Asegúrate de que la imagen sea legible.');
        }
        continue;
      }

      // Intentar match inteligente/parcial para expenseType
      if (parsed.expenseType && !EXPENSE_TYPES.includes(parsed.expenseType)) {
        const lower = parsed.expenseType.toLowerCase();
        const match = EXPENSE_TYPES.find((t) => t.toLowerCase().includes(lower) || lower.includes(t.toLowerCase()));
        parsed.expenseType = match || '';
      }

      // Asegurar que todos los campos numéricos son números
      const numericFields = ['netAmount', 'totalBoletaServicios', 'totalBoletaHonorarios', 'specificTax', 'ivaAmount', 'totalAmount'];
      for (const field of numericFields) {
        if (parsed[field] === null || parsed[field] === undefined) {
          parsed[field] = 0;
        } else {
          parsed[field] = Number(parsed[field]) || 0;
        }
      }

      // Validar datos extraídos
      const validation = validateExtractedData(parsed);
      if (validation.isValid) {
        console.log(`[VLM Service] [Intento ${attempt}] Extracción exitosa y validada.`);
        return parsed;
      } else {
        const errorsStr = validation.errors.join('; ');
        console.warn(`[VLM Service] [Intento ${attempt}] Falló la validación:`, validation.errors);
        feedback = validation.errors.map((err, i) => `${i + 1}. ${err}`).join('\n');

        if (attempt >= maxAttempts) {
          throw new Error(`La extracción falló la validación final:\n${errorsStr}`);
        }
      }
    } catch (err) {
      console.error(`[VLM Service] Error en intento ${attempt}:`, err);
      if (attempt >= maxAttempts) {
        throw err;
      }
      feedback = `Ocurrió un error al consultar la API: ${err.message}. Por favor reintenta y asegúrate de seguir las instrucciones.`;
    }
  }

  throw new Error('No se pudo extraer la información del documento.');
}
