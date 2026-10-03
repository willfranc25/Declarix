import { checked, uuid } from "./admin.js";
import { schedulerAuthorized } from "./schedulerAuth.js";
import { getDocumentPreview } from "./documentPreview.js";

// Operations-only warming uses the same server-to-server signed dispatch as the
// extraction worker. It never returns the source, a signed image URL or secrets.
export async function handlePreviewMaintenance(req, res, db) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();
  if (!await schedulerAuthorized(req.headers, db, process.env.CRON_SECRET)) return res.status(401).end();
  if (!uuid(req.query?.jobId)) return res.status(400).json({ error: "INVALID_JOB" });
  try {
    const job = checked(await db.from("extraction_jobs").select("id,user_id,object_path,mime_type,status").eq("id", req.query.jobId).maybeSingle());
    if (!job || job.status !== "ready" || !job.mime_type?.startsWith("image/")) return res.status(404).end();
    const started = performance.now();
    const preview = await getDocumentPreview(db, job);
    return res.status(200).json({ jobId: job.id, cache: preview.cache, bytes: preview.bytes.length, durationMs: Math.round(performance.now() - started) });
  } catch (err) {
    const reason = /pixel limit/i.test(err.message || "") ? "IMAGE_PIXEL_LIMIT" : "PREVIEW_UNAVAILABLE";
    console.error("[document-preview] warm failed", { jobId: req.query.jobId, reason });
    return res.status(500).json({ error: reason });
  }
}
