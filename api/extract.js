import { createClient } from '@supabase/supabase-js';
import { buildExtractionPrompt } from '../src/services/extractionPrompt.js';

/**
 * POST /api/extract — Proxy de extracción con IA.
 *
 * La API key del proveedor de IA vive SOLO aquí (variables de entorno del
 * servidor), nunca en el bundle del cliente. El endpoint:
 *   - Exige sesión Supabase válida (Authorization: Bearer <access_token>).
 *   - Aplica límite mensual y de ráfaga por usuario (tabla usage_events).
 *   - Registra cada extracción para medición/facturación por plan.
 *   - Devuelve errores entendibles sin filtrar detalles del proveedor.
 *
 * Variables de entorno requeridas (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL                URL del proyecto Supabase
 *   SUPABASE_SERVICE_ROLE_KEY   Service role key (verificación de sesión +
 *                               escritura en usage_events; bypasea RLS)
 *   VLM_PROVIDER                'gemini' (default) | 'openai'
 *   GEMINI_API_KEY / OPENAI_API_KEY  según proveedor
 *   AI_MONTHLY_LIMIT            extracciones/mes por usuario (default 300)
 *   AI_BURST_LIMIT              extracciones/minuto por usuario (default 10)
 */

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
// Base64 de ~4MB de imagen; también protege el límite de body de Vercel (4.5MB)
const MAX_BASE64_LENGTH = 5_500_000;

function getAdminClient() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function callGemini(apiKey, base64Image, mimeType, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } },
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
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`Gemini API ${response.status}`), { detail });
  }
  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callOpenAI(apiKey, base64Image, mimeType, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64Image}` } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw Object.assign(new Error(`OpenAI API ${response.status}`), { detail });
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  const requestId = crypto.randomUUID();
  res.setHeader('X-Request-Id', requestId);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  const admin = getAdminClient();
  const provider = process.env.VLM_PROVIDER || 'gemini';
  const providerKey = provider === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;

  if (!admin || !providerKey) {
    console.error(`[extract][${requestId}] Configuración incompleta del servidor (faltan variables de entorno).`);
    return res.status(503).json({ error: 'El servicio de extracción no está configurado. Contacta a soporte.' });
  }

  // --- Autenticación ---
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Debes iniciar sesión para usar la extracción con IA.' });
  }

  const { data: { user } = {}, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: 'Sesión inválida o expirada. Vuelve a iniciar sesión.' });
  }

  // --- Validación de entrada ---
  const { imageBase64, mimeType, feedback } = req.body || {};
  if (typeof imageBase64 !== 'string' || !imageBase64) {
    return res.status(400).json({ error: 'Falta la imagen del comprobante.' });
  }
  if (imageBase64.length > MAX_BASE64_LENGTH) {
    return res.status(413).json({ error: 'La imagen es demasiado grande (máx. ~4 MB). Intenta con una foto más liviana.' });
  }
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({ error: 'Formato de imagen no soportado. Usa JPG, PNG o WebP.' });
  }
  const safeFeedback = typeof feedback === 'string' ? feedback.slice(0, 2000) : '';

  // --- Organización activa y límites del plan ---
  // El límite mensual sale de la tabla `plans` (configurable en BD);
  // AI_MONTHLY_LIMIT queda como respaldo para usuarios legacy sin organización.
  let organizationId = null;
  let planMonthlyLimit;
  const { data: memberships, error: memberError } = await admin
    .from('organization_members')
    .select('organization_id, role, organizations(plan_id, plans(max_ai_calls_month))')
    .eq('user_id', user.id);

  if (memberError) {
    console.error(`[extract][${requestId}] Error consultando membresías:`, memberError);
  } else if (memberships && memberships.length > 0) {
    const active = memberships.find((m) => m.role === 'owner') || memberships[0];
    organizationId = active.organization_id;
    planMonthlyLimit = active.organizations?.plans?.max_ai_calls_month;
  }

  const burstLimit = Number(process.env.AI_BURST_LIMIT) || 10;
  // undefined = sin org/plan → respaldo por env; null en el plan = ilimitado
  const monthlyLimit = planMonthlyLimit === undefined
    ? (Number(process.env.AI_MONTHLY_LIMIT) || 300)
    : planMonthlyLimit;

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const minuteAgo = new Date(now.getTime() - 60_000).toISOString();

  const monthQuery = admin.from('usage_events').select('id', { count: 'exact', head: true })
    .eq('event_type', 'ai_extraction').gte('created_at', monthStart);
  if (organizationId) {
    monthQuery.eq('organization_id', organizationId);
  } else {
    monthQuery.eq('user_id', user.id);
  }

  const [{ count: monthCount, error: monthError }, { count: burstCount, error: burstError }] = await Promise.all([
    monthQuery,
    admin.from('usage_events').select('id', { count: 'exact', head: true })
      .eq('user_id', user.id).eq('event_type', 'ai_extraction').gte('created_at', minuteAgo),
  ]);

  if (monthError || burstError) {
    console.error(`[extract][${requestId}] Error consultando usage_events:`, monthError || burstError);
    return res.status(500).json({ error: 'No se pudo verificar tu cuota de uso. Intenta de nuevo.' });
  }
  if (burstCount >= burstLimit) {
    return res.status(429).json({ error: 'Demasiadas extracciones seguidas. Espera un momento e intenta de nuevo.' });
  }
  if (monthlyLimit !== null && monthCount >= monthlyLimit) {
    return res.status(429).json({ error: 'Alcanzaste el límite mensual de extracciones con IA de tu plan.' });
  }

  // --- Llamada al proveedor ---
  const prompt = buildExtractionPrompt(safeFeedback);
  let text;
  try {
    text = provider === 'openai'
      ? await callOpenAI(providerKey, imageBase64, mimeType, prompt)
      : await callGemini(providerKey, imageBase64, mimeType, prompt);
  } catch (err) {
    console.error(`[extract][${requestId}] user=${user.id} provider=${provider} error=${err.message}`, err.detail || '');
    return res.status(502).json({ error: 'El servicio de IA no respondió correctamente. Intenta de nuevo en unos segundos.' });
  }

  // --- Registro de consumo (no bloquea la respuesta si falla) ---
  const { error: usageError } = await admin.from('usage_events').insert({
    user_id: user.id,
    organization_id: organizationId,
    event_type: 'ai_extraction',
    metadata: { provider, request_id: requestId, retry: Boolean(safeFeedback) },
  });
  if (usageError) {
    console.error(`[extract][${requestId}] No se pudo registrar el consumo:`, usageError);
  }

  return res.status(200).json({ text, requestId });
}
