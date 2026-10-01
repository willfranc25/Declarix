import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createDocumentPreview } from "./documentPreview.js";

test("review preview is a bounded JPEG while the original remains untouched", async () => {
  const original = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "white" } })
    .png().toBuffer();
  const preview = await createDocumentPreview(original);
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 1200 && metadata.height <= 1600);
  assert.equal((await sharp(original).metadata()).width, 2400);
});
