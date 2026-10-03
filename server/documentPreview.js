import sharp from "sharp";
import { createHash } from "node:crypto";
import { checked } from "./admin.js";

export const PREVIEW_BUCKET = "document-previews";
const generating = new Map();
export const previewPath = (job) => `${job.user_id}/${job.id}/${createHash("sha256").update(job.object_path).digest("hex")}-v1.jpg`;

export async function createDocumentPreview(bytes) {
  return sharp(bytes, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

// Private, disposable derivatives. Never overwrite or modify the source file.
export async function storeDocumentPreview(db, job, bytes) {
  const preview = await createDocumentPreview(bytes);
  const { error } = await db.storage.from(PREVIEW_BUCKET).upload(previewPath(job), preview, {
    contentType: "image/jpeg", cacheControl: "31536000", upsert: false,
  });
  if (error && !["409", "Duplicate"].includes(String(error.statusCode || error.code))) {
    console.warn("[document-preview] cache write failed", { jobId: job.id, code: error.statusCode || error.code || "STORAGE_ERROR" });
  }
  return preview;
}

// Caller MUST authorize the job before using this service (including cache hits).
export async function getDocumentPreview(db, job) {
  const path = previewPath(job);
  const cached = await db.storage.from(PREVIEW_BUCKET).download(path);
  if (!cached.error && cached.data) {
    return { bytes: Buffer.from(await cached.data.arrayBuffer()), cache: "hit" };
  }
  // Deduplicate generation in this instance; unique Storage paths handle races
  // between instances without replacing an existing preview.
  let pending = generating.get(path);
  if (!pending) {
    pending = (async () => {
      const original = checked(await db.storage.from("documents").download(job.object_path));
      return storeDocumentPreview(db, job, Buffer.from(await original.arrayBuffer()));
    })().finally(() => generating.delete(path));
    generating.set(path, pending);
  }
  return { bytes: await pending, cache: "miss" };
}
