import { createClient } from "@supabase/supabase-js";
export function adminClient() {
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
    throw Object.assign(new Error("SERVICE_UNAVAILABLE"), { status: 503 });
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export async function authenticate(req, db) {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
  if (!token)
    throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw Object.assign(new Error("UNAUTHENTICATED"), { status: 401 });
  return data.user;
}
export const checked = ({ data, error }) => {
  if (error) throw error;
  return data;
};
export const uuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
const messages = {
  UNAUTHENTICATED: "Inicia sesión nuevamente.",
  SERVICE_UNAVAILABLE: "El servicio todavía no está configurado.",
  COMPANY_FORBIDDEN: "Selecciona una empresa activa de tu cartera.",
  ACCOUNT_DISABLED: "La cuenta no está habilitada.",
  STORAGE_LIMIT: "No hay espacio disponible para este archivo.",
  UPLOAD_LIMIT: "Finaliza o cancela las cargas pendientes.",
  CREDITS_REQUIRED: "El plan no tiene unidades disponibles para esta carga.",
  MONTHLY_LIMIT_REACHED: "Alcanzaste el límite mensual del plan. Cambia de plan o espera el próximo período.",
  SUBSCRIPTION_REQUIRED: "La prueba terminó. Activa una suscripción para procesar más documentos.",
  PLAN_COMPANY_LIMIT: "Llegaste al máximo de empresas incluidas en tu plan.",
  JOB_PROCESSING: "El archivo está en procesamiento.",
  INVALID_FILE:
    "Archivo inválido. Usa JPEG, PNG, WEBP, PDF sin contraseña o XML DTE; máximo 20 MB y 20 páginas.",
  JOB_NOT_CANCELLABLE:
    "Este archivo ya fue procesado; puedes descartarlo en revisión.",
  JOB_NOT_FOUND: "No se encontró el archivo.",
};
export function respondError(res, err) {
  const code = Object.keys(messages).find((k) => err.message?.includes(k));
  const duplicate = err.code === "23505";
  res.status(err.status || (duplicate ? 409 : code ? 400 : 500)).json({
    code: duplicate ? "DUPLICATE_FILE" : code || "REQUEST_FAILED",
    error: duplicate
      ? "Este archivo ya está en la empresa. Revisa su cola de documentos."
      : messages[code] ||
        "No se pudo completar la operación. Inténtalo nuevamente.",
  });
}
