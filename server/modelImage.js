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

// A second, independent reading gets a clearer copy. Landscape photos can
// contain a receipt turned either way, so provide both upright candidates.
export async function folioVerificationImages(bytes, mimeType) {
  if (!mimeType.startsWith("image/")) return [];
  const { default: sharp } = await import("sharp");
  const oriented = await sharp(bytes).rotate().toBuffer();
  const { width, height } = await sharp(oriented).metadata();
  const angles = width > height * 1.15 ? [90, 270] : [0];
  const parts = [];
  for (const angle of angles) {
    const copy = await sharp(oriented)
      .rotate(angle)
      .resize(3000, 3000, { fit: "inside", withoutEnlargement: true })
      .normalise()
      .sharpen()
      .jpeg({ quality: 85 })
      .toBuffer();
    parts.push({ type: "image_url", image_url: {
      url: `data:image/jpeg;base64,${copy.toString("base64")}`,
    } });
  }
  return parts;
}
