import { adminClient, authenticate, checked, respondError, uuid } from "../server/admin.js";
import { getDocumentPreview, validPreviewVariant } from "../server/documentPreview.js";

export const createPreviewHandler = (getDb = adminClient) => async (req, res) => {
  res.setHeader("Vary", "Authorization");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET" });
  try {
    const started = performance.now();
    const db = getDb();
    const user = await authenticate(req, db);
    const jobId = req.query?.jobId;
    if (!uuid(jobId)) return res.status(400).json({ error: "Documento inválido" });
    const job = checked(await db.from("extraction_jobs")
      .select("id,user_id,object_path,mime_type,status")
      .eq("id", jobId).eq("user_id", user.id).maybeSingle());
    if (!job || !["uploaded", "queued", "processing", "ready"].includes(job.status) || !job.mime_type?.startsWith("image/"))
      return res.status(404).json({ error: "Vista previa no disponible" });
    const variant = req.query?.variant ?? "review";
    if (!validPreviewVariant(variant)) return res.status(400).json({ error: "INVALID_PREVIEW_VARIANT" });
    const preview = await getDocumentPreview(db, job, variant);
    res.setHeader("X-Preview-Cache", preview.cache);
    res.setHeader("Server-Timing", `preview;dur=${Math.round(performance.now() - started)}`);
    res.setHeader("Content-Type", "image/jpeg");
    return res.status(200).send(preview.bytes);
  } catch (err) {
    console.error("[document-preview] request failed", {
      jobId: uuid(req.query?.jobId) ? req.query.jobId : null,
      code: err.code || err.statusCode || err.status || "PREVIEW_FAILED",
      // Only allow known image errors; never log tokens, object paths or receipts.
      reason: /pixel limit/i.test(err.message || "") ? "IMAGE_PIXEL_LIMIT" : "PREVIEW_UNAVAILABLE",
    });
    return respondError(res, err);
  }
};
export default createPreviewHandler();
