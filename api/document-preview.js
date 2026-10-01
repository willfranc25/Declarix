import { adminClient, authenticate, checked, respondError, uuid } from "../server/admin.js";
import { createDocumentPreview } from "../server/documentPreview.js";

export default async function handler(req, res) {
  res.setHeader("Vary", "Authorization");
  res.setHeader("Cache-Control", "private, max-age=3600");
  if (req.method !== "GET") return res.status(405).json({ error: "Usa GET" });
  try {
    const db = adminClient();
    const user = await authenticate(req, db);
    const jobId = req.query?.jobId;
    if (!uuid(jobId)) return res.status(400).json({ error: "Documento inválido" });
    const job = checked(await db.from("extraction_jobs")
      .select("id,user_id,object_path,mime_type,status")
      .eq("id", jobId).eq("user_id", user.id).maybeSingle());
    if (!job || job.status !== "ready" || !job.mime_type?.startsWith("image/"))
      return res.status(404).json({ error: "Vista previa no disponible" });
    const original = checked(await db.storage.from("documents").download(job.object_path));
    const bytes = Buffer.from(await original.arrayBuffer());
    const preview = await createDocumentPreview(bytes);
    res.setHeader("Content-Type", "image/jpeg");
    return res.status(200).send(preview);
  } catch (err) {
    return respondError(res, err);
  }
}
