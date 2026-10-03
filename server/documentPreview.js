import sharp from "sharp";
import { createHash } from "node:crypto";
import { checked } from "./admin.js";

export const PREVIEW_BUCKET = "document-previews";
const generating = new Map();
export const validPreviewVariant = (variant) => ["review", "detail"].includes(variant);
export const previewPath = (job, variant = "review") => `${job.user_id}/${job.id}/${createHash("sha256").update(job.object_path).digest("hex")}${variant === "detail" ? "-detail" : ""}-v1.jpg`;

export async function createDocumentPreview(bytes, variant = "review") {
  if (!validPreviewVariant(variant)) throw new Error("INVALID_PREVIEW_VARIANT");
  // Bound detailed responses below the server response and private bucket limits.
  if (variant === "detail") {
    for (const [width, height, quality] of [[3200, 4200, 88], [2800, 3600, 80], [2200, 3000, 72]]) {
      const detail = await sharp(bytes).rotate()
        .resize({ width, height, fit: "inside", withoutEnlargement: true })
        .jpeg({ quality }).toBuffer();
      if (detail.length <= 3 * 1024 * 1024) return detail;
    }
    return createDocumentPreview(bytes);
  }
  // Use the same bounded Sharp default as imageForModel. Camera photos accepted
  // by extraction can exceed 40 MP; a smaller preview limit rejected them.
  return sharp(bytes)
    .rotate()
    .resize({ width: 1200, height: 1600, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toBuffer();
}

// Private, disposable derivatives. Never overwrite or modify the source file.
export async function storeDocumentPreview(db, job, bytes, variant = "review") {
  const source = await sharp(bytes).metadata();
  const preview = await createDocumentPreview(bytes, variant);
  console.info("[document-preview] generated", { jobId: job.id, variant, width: source.width, height: source.height, originalBytes: bytes.length, previewBytes: preview.length });
  const { error } = await db.storage.from(PREVIEW_BUCKET).upload(previewPath(job, variant), preview, {
    contentType: "image/jpeg", cacheControl: "31536000", upsert: false,
  });
  if (error && !["409", "Duplicate"].includes(String(error.statusCode || error.code))) {
    console.warn("[document-preview] cache write failed", { jobId: job.id, code: error.statusCode || error.code || "STORAGE_ERROR" });
  }
  return preview;
}

// Caller MUST authorize the job before using this service (including cache hits).
export async function getDocumentPreview(db, job, variant = "review") {
  if (!validPreviewVariant(variant)) throw new Error("INVALID_PREVIEW_VARIANT");
  const path = previewPath(job, variant);
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
      return storeDocumentPreview(db, job, Buffer.from(await original.arrayBuffer()), variant);
    })().finally(() => generating.delete(path));
    generating.set(path, pending);
  }
  return { bytes: await pending, cache: "miss" };
}
