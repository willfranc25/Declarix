import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { folioVerificationImages, identifierCloseups, imageForModel } from "./modelImage.js";

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

test('identifier close-ups cover sideways orientations and preserve the original bytes', { skip: !sharp }, async () => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: 'white' } }).png().toBuffer();
  const snapshot = Buffer.from(original);
  const parts = await identifierCloseups(original, 'image/png', {
    documentNumber: { x: 200, y: 100, width: 200, height: 50 },
    providerRut: { x: 300, y: 200, width: 300, height: 50 },
  });
  assert.equal(parts.length, 6);
  let total = 0;
  for (const part of parts) {
    const bytes = Buffer.from(part.image_url.url.split(',')[1], 'base64');
    total += bytes.length;
    const metadata = await sharp(bytes).metadata();
    assert.ok(Math.max(metadata.width, metadata.height) <= 2400);
    assert.equal(metadata.format, 'jpeg');
  }
  assert.ok(total <= 5 * 1024 * 1024);
  assert.deepEqual(original, snapshot);
  assert.equal((await identifierCloseups(original, 'image/png', { documentNumber: { x: -100, y: 0, width: 10, height: 5 } })).length, 3);
});

test("landscape receipt verification supplies both rotations without changing the upload", { skip: !sharp }, async () => {
  const original = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "white" } })
    .png().toBuffer();
  const firstBytes = Buffer.from(original.subarray(0, 32));
  const parts = await folioVerificationImages(original, "image/png");
  assert.equal(parts.length, 2);
  for (const part of parts) {
    const encoded = part.image_url.url.split(",")[1];
    const metadata = await sharp(Buffer.from(encoded, "base64")).metadata();
    assert.equal(metadata.width, 800);
    assert.equal(metadata.height, 1200);
    assert.ok(Buffer.from(encoded, "base64").length < 4 * 1024 * 1024);
  }
  assert.deepEqual(original.subarray(0, 32), firstBytes);
  assert.deepEqual(await folioVerificationImages(original, "application/pdf"), []);
});
