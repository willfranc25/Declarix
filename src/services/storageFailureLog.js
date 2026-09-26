import { supabase } from "./supabaseClient";

const safeCode = (error) => {
  const code = String(error?.code || (error?.status ? `HTTP_${error.status}` : "UNKNOWN"));
  return /^[A-Za-z0-9_-]{1,40}$/.test(code) ? code : "UNKNOWN";
};

/** Persist operational metadata only; never store invoice contents or raw errors. */
export async function recordStorageFailure({
  stage,
  organizationId,
  invoiceId = null,
  error,
}) {
  const payload = {
    stage,
    organization_id: organizationId,
    invoice_id: invoiceId,
    error_code: safeCode(error),
  };
  try {
    if (!supabase) throw new Error("Supabase unavailable");
    const { error: insertError } = await supabase
      .from("storage_failure_events")
      .insert(payload);
    if (insertError) throw insertError;
  } catch {
    // Keep a minimal local diagnostic if persistence is unavailable.
    console.error("Declarix storage failure (event could not be persisted)", payload);
  }
}

export async function listStorageFailures(organizationId, limit = 50) {
  if (!supabase || !organizationId) return { data: [], error: null };
  return supabase
    .from("storage_failure_events")
    .select("id, stage, invoice_id, error_code, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);
}
