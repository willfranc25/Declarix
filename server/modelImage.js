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
  const oriented = await sharp(bytes).rotate()
    .resize(5000, 5000, { fit: "inside", withoutEnlargement: true }).toBuffer();
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

// Positions are hints: keep whole-photo context because a model may report
// coordinates in an upright orientation even when the camera photo is sideways.
export async function identifierCloseups(bytes, mimeType, locations = {}) {
  if (!mimeType.startsWith("image/")) return [];
  const { default: sharp } = await import("sharp");
  const source = await sharp(bytes).rotate()
    .resize(5000, 5000, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 95 }).toBuffer();
  const metadata = await sharp(source).metadata();
  const angles = metadata.width > metadata.height * 1.15 ? [0, 90, 270] : [0];
  const boxes = [locations.documentNumber, locations.providerRut].filter(box =>
    box && [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
    box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0 &&
    box.x + box.width <= 1000 && box.y + box.height <= 1000);
  const parts = [];
  let totalBytes = 0;
  for (const angle of angles) {
    const oriented = await sharp(source).rotate(angle).toBuffer();
    const { width, height } = await sharp(oriented).metadata();
    const regions = boxes.length ? boxes : [{ x: 0, y: 0, width: 1000, height: 450 }];
    for (const box of regions) {
      const left = Math.max(0, Math.floor((box.x - 60) * width / 1000));
      const top = Math.max(0, Math.floor((box.y - 70) * height / 1000));
      const right = Math.min(width, Math.ceil((box.x + box.width + 60) * width / 1000));
      const bottom = Math.min(height, Math.ceil((box.y + box.height + 70) * height / 1000));
      const copy = await sharp(oriented).extract({ left, top, width: right - left, height: bottom - top })
        .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
        .normalise().sharpen().jpeg({ quality: 90 }).toBuffer();
      // Bound aggregate payload too, rather than repeating several huge photos.
      if (totalBytes + copy.length > 5 * 1024 * 1024) continue;
      totalBytes += copy.length;
      parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${copy.toString("base64")}` } });
    }
  }
  return parts;
}
