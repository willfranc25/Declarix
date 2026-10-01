import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { imageForModel } from "./modelImage.js";

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  // Local Windows application control can block native modules; Linux CI runs this test.
}

test("large uploads get a small model copy without changing the stored original", { skip: !sharp }, async () => {
  const width = 1700;
  const raw = randomBytes(width * width * 3);
  const original = await sharp(raw, { raw: { width, height: width, channels: 3 } })
    .png()
    .toBuffer();
  assert.ok(original.length > 4 * 1024 * 1024);
  const firstBytes = Buffer.from(original.subarray(0, 32));

  const result = await imageForModel(original, "image/png");

  assert.equal(result.mimeType, "image/jpeg");
  assert.ok(result.bytes.length <= 4 * 1024 * 1024);
  assert.deepEqual(original.subarray(0, 32), firstBytes);
  assert.equal((await sharp(result.bytes).metadata()).format, "jpeg");
});

test("small images and PDFs are passed through unchanged", async () => {
  const small = Buffer.from("image");
  assert.deepEqual(await imageForModel(small, "image/jpeg"), {
    bytes: small,
    mimeType: "image/jpeg",
  });
  assert.deepEqual(await imageForModel(small, "application/pdf"), {
    bytes: small,
    mimeType: "application/pdf",
  });
});
