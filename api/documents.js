import { randomUUID } from "node:crypto";
import {
  adminClient,
  authenticate,
  checked,
  uuid,
  respondError,
} from "../server/admin.js";
import { inspectDocument, MIME_TYPES } from "../server/documentInput.js";
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  let db, user;
  try {
    db = adminClient();
    user = await authenticate(req, db);
    const body = req.body || {};
    if (body.action === "prepare") {
      if (
        !uuid(body.companyId) ||
        !MIME_TYPES.includes(body.mimeType) ||
        !Number.isSafeInteger(body.size) ||
        body.size < 1 ||
        body.size > 20971520 ||
        typeof body.name !== "string" ||
        body.name.length > 240
      )
        throw new Error("INVALID_FILE");
      const job = checked(
        await db.rpc("prepare_extraction", {
          p_user: user.id,
          p_company: body.companyId,
          p_id: randomUUID(),
          p_name: body.name,
          p_mime: body.mimeType,
          p_bytes: body.size,
        }),
      );
      const signed = await db.storage
        .from("documents")
        .createSignedUploadUrl(job.object_path);
      if (signed.error) {
        await db.rpc("cancel_extraction", { p_user: user.id, p_job: job.id });
        throw signed.error;
      }
      return res
        .status(201)
        .json({
          jobId: job.id,
          path: job.object_path,
          token: signed.data.token,
        });
    }
    if (!uuid(body.jobId)) throw new Error("JOB_NOT_FOUND");
    const job = checked(
      await db
        .from("extraction_jobs")
        .select("*")
        .eq("id", body.jobId)
        .eq("user_id", user.id)
        .single(),
    );
    if (!job) throw new Error("JOB_NOT_FOUND");
    if (body.action === "enqueue") {
      if (job.status !== "uploading")
        return res.status(200).json({ jobId: job.id, status: job.status });
      const blob = checked(
        await db.storage.from("documents").download(job.object_path),
      );
      const bytes = Buffer.from(await blob.arrayBuffer());
      if (bytes.length !== Number(job.file_bytes))
        throw new Error("INVALID_FILE");
      const input = await inspectDocument(bytes, job.mime_type);
      const result = checked(
        await db.rpc("enqueue_extraction", {
          p_user: user.id,
          p_job: job.id,
          p_hash: input.hash,
          p_pages: input.pages,
        }),
      );
      return res.status(200).json({ jobId: job.id, status: result.status });
    }
    if (body.action === "retry") {
      checked(
        await db.rpc("retry_extraction", { p_user: user.id, p_job: job.id }),
      );
      return res.status(200).json({ jobId: job.id });
    }
    if (body.action === "cancel") {
      // Keep the object until its signed upload token expires. The janitor deletes it later.
      checked(
        await db.rpc("cancel_extraction", { p_user: user.id, p_job: job.id }),
      );
      return res.status(200).json({ jobId: job.id });
    }
    return res.status(400).json({ error: "Acción inválida" });
  } catch (err) {
    return respondError(res, err);
  }
}
