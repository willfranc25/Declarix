import { EXPENSE_TYPES } from '../data/expenseTypes';
import { getStorageProvider } from './storage/StorageProvider';

/**
 * Prompt de extracción para modelos de visión (OpenAI GPT-4o, Gemini, etc.)
 * Adaptado al formato de rendición Saludent.
 */
const EXTRACTION_PROMPT = `Analiza esta imagen de un comprobante chileno (boleta, factura, boleta de honorarios o nota de crédito).

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
- "providerRut": buscar RUT, R.U.T. seguido de números como 12.345.678-9
- "date": convertir DD/MM/YYYY a YYYY-MM-DD
- "detail": describir brevemente qué se compró
- Retornar null o 0 para campos no visibles en la imagen

Categorías válidas para "expenseType":
${EXPENSE_TYPES.join(', ')}

Elige la categoría que mejor coincida con el contexto de la compra.`;

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
 * Extrae datos de un comprobante usando OpenAI Vision API.
 */
async function extractWithOpenAI(apiKey, base64Image, mimeType) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: EXTRACTION_PROMPT },
            {
              type: 'image_url',
              image_url: { url: `data:${mimeType};base64,${base64Image}` },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Extrae datos de un comprobante usando Google Gemini API.
 */
async function extractWithGemini(apiKey, base64Image, mimeType) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: EXTRACTION_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Servicio principal de extracción VLM.
 * Detecta el proveedor configurado y llama a la API correspondiente.
 */
export async function extractInvoiceData(imageFile) {
  const storage = getStorageProvider();

  // Obtener configuración del proveedor de IA
  const provider = (await storage.getSetting('vlm_provider')) || 'gemini';
  const apiKey = await storage.getSetting('vlm_api_key');

  if (!apiKey) {
    throw new Error(
      'No se ha configurado una API Key. Ve a Configuración para agregar tu clave de OpenAI o Gemini.'
    );
  }

  const base64Image = await fileToBase64(imageFile);
  const mimeType = imageFile.type || 'image/jpeg';

  let rawResponse;
  if (provider === 'openai') {
    rawResponse = await extractWithOpenAI(apiKey, base64Image, mimeType);
  } else {
    rawResponse = await extractWithGemini(apiKey, base64Image, mimeType);
  }

  const parsed = tryParseJson(rawResponse);
  if (!parsed) {
    console.error("Error al parsear la respuesta del modelo. Respuesta cruda:", rawResponse);
    throw new Error('No se pudo interpretar la respuesta del modelo de IA. Intenta con otra imagen.');
  }

  // Validar que expenseType sea una categoría válida
  if (parsed.expenseType && !EXPENSE_TYPES.includes(parsed.expenseType)) {
    // Intentar match parcial
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

  return parsed;
}
