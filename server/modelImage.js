const MAX_MODEL_IMAGE_BYTES = 4 * 1024 * 1024;

// Keep the uploaded original in Storage. Only the copy sent to the model is resized.
export async function imageForModel(bytes, mimeType) {
  if (!mimeType.startsWith("image/") || bytes.length <= MAX_MODEL_IMAGE_BYTES)
    return { bytes, mimeType };

  const { default: sharp } = await import("sharp");
  for (const [dimension, quality] of [[3000, 82], [2400, 75], [2000, 68]]) {
    const reduced = await sharp(bytes)
      .rotate()
      .resize(dimension, dimension, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality })
      .toBuffer();
    if (reduced.length <= MAX_MODEL_IMAGE_BYTES)
      return { bytes: reduced, mimeType: "image/jpeg" };
  }

  throw new Error("IMAGE_TOO_LARGE");
}
