import { supabase } from "./supabaseClient";
let processingQueue;
export async function documentRequest(action, payload) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Inicia sesión nuevamente.");
  const response = await fetch("/api/documents", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + session.access_token,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "No se pudo completar la carga.");
  return data;
}
export async function uploadDocument(file, companyId) {
  const mimeType =
    file.type || (/\.xml$/i.test(file.name) ? "application/xml" : "");
  const prepared = await documentRequest("prepare", {
    companyId,
    name: file.name,
    mimeType,
    size: file.size,
  });
  try {
    const { error } = await supabase.storage
      .from("documents")
      .uploadToSignedUrl(prepared.path, prepared.token, file, {
        contentType: mimeType,
      });
    if (error) throw error;
    await documentRequest("enqueue", { jobId: prepared.jobId });
    return prepared.jobId;
  } catch (err) {
    // A failed enqueue remains visible and can be retried without uploading again.
    throw new Error(
      err.message + " El archivo pendiente aparecerá en la cola.",
      { cause: err },
    );
  }
}
export function wakeExtractionQueue() {
  if (processingQueue) return processingQueue;
  processingQueue = (async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return;
    for (let i = 0; i < 20; i++) {
      const response = await fetch("/api/process-jobs", {
        method: "POST",
        headers: { Authorization: "Bearer " + session.access_token },
      });
      if (!response.ok) return;
      const result = await response.json();
      if (!result.worked || result.processed < 25) return;
    }
  })().finally(() => {
    processingQueue = null;
  });
  return processingQueue;
}
export async function listJobs(companyId) {
  const rows = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await supabase
      .from("extraction_jobs")
      .select("*")
      .eq("organization_id", companyId)
      .not("status", "in", "(cancelled,saved)")
      .order("created_at", { ascending: false })
      .order("id")
      .range(from, from + 99);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 100) return rows;
  }
}
export async function patchReview(jobId, index, patch) {
  const { error } = await supabase.rpc("patch_job_review", {
    p_job: jobId,
    p_index: index,
    p_patch: patch,
  });
  if (error) throw error;
}

