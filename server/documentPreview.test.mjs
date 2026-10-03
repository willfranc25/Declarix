import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { randomBytes } from "node:crypto";
import { createDocumentPreview, getDocumentPreview, PREVIEW_BUCKET, previewPath } from "./documentPreview.js";
import { createPreviewHandler } from "../api/document-preview.js";
import { handlePreviewMaintenance } from "./previewMaintenance.js";

test("review preview is a bounded JPEG while the original remains untouched", async () => {
  const original = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "white" } })
    .png().toBuffer();
  const preview = await createDocumentPreview(original);
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 1200 && metadata.height <= 1600);
  assert.equal((await sharp(original).metadata()).width, 2400);
});

test("48 MP camera photos accepted by extraction also produce a review preview", async () => {
  const original = await sharp({ create: { width: 8000, height: 6000, channels: 3, background: "white" } }).jpeg().toBuffer();
  await assert.rejects(() => sharp(original, { limitInputPixels: 40_000_000 }).resize(1200).toBuffer(), /pixel limit/i);
  const preview = await createDocumentPreview(original);
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 1200 && metadata.height <= 1600);
  assert.equal((await sharp(original).metadata()).width, 8000);
});

const job = { id: "11111111-1111-4111-8111-111111111111", user_id: "owner", object_path: "owner/company/source.jpg", status: "ready", mime_type: "image/jpeg" };
test("detailed JPEG remains bounded even for noisy camera images", async () => {
  const source = await sharp(randomBytes(3300 * 4300 * 3), { raw: { width: 3300, height: 4300, channels: 3 } }).png().toBuffer();
  const detail = await createDocumentPreview(source, "detail");
  const metadata = await sharp(detail).metadata();
  assert.ok(detail.length <= 3 * 1024 * 1024);
  assert.ok(metadata.width <= 3200 && metadata.height <= 4200);
  assert.ok(metadata.width > 1200);
  assert.equal((await sharp(source).metadata()).width, 3300);
});
async function storageFixture({ writeError = null } = {}) {
  const original = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "white" } }).jpeg().toBuffer();
  const files = new Map();
  let originals = 0;
  const db = { storage: { from: (bucket) => ({
    download: async (path) => {
      if (bucket === "documents") { originals++; return { data: new Blob([original]) }; }
      return files.has(path) ? { data: new Blob([files.get(path)]) } : { error: { statusCode: "404" } };
    },
    upload: async (path, bytes, options) => {
      assert.equal(bucket, PREVIEW_BUCKET);
      assert.equal(options.upsert, false);
      if (!writeError) files.set(path, bytes);
      return { error: writeError };
    },
  }) } };
  return { db, files, originals: () => originals };
}

test("cached review requests never download or transform the original again", async () => {
  const fixture = await storageFixture();
  const first = await getDocumentPreview(fixture.db, job);
  const second = await getDocumentPreview(fixture.db, job);
  assert.equal(first.cache, "miss");
  assert.equal(second.cache, "hit");
  assert.equal(fixture.originals(), 1);
  assert.deepEqual(first.bytes, second.bytes);
  assert.notEqual(previewPath(job), previewPath({ ...job, object_path: "different-source" }));
});

test("review and detail have separate caches and generation locks", async () => {
  const fixture = await storageFixture();
  const [review, detail] = await Promise.all([
    getDocumentPreview(fixture.db, job), getDocumentPreview(fixture.db, job, "detail"),
  ]);
  assert.notEqual(previewPath(job), previewPath(job, "detail"));
  assert.equal(fixture.files.size, 2);
  assert.ok((await sharp(detail.bytes).metadata()).width > (await sharp(review.bytes).metadata()).width);
  assert.equal((await getDocumentPreview(fixture.db, job, "detail")).cache, "hit");
  assert.equal(fixture.originals(), 2);
  await assert.rejects(() => getDocumentPreview(fixture.db, job, "original"), /INVALID_PREVIEW_VARIANT/);
});

test("concurrent cache misses share generation and a failed write still returns the preview", async () => {
  const fixture = await storageFixture({ writeError: { statusCode: "503" } });
  const [a, b] = await Promise.all([getDocumentPreview(fixture.db, job), getDocumentPreview(fixture.db, job)]);
  assert.equal(fixture.originals(), 1);
  assert.deepEqual(a.bytes, b.bytes);
  assert.equal((await sharp(a.bytes).metadata()).format, "jpeg");
});

test("preview endpoint checks ownership before reading even a persisted preview", async () => {
  let reads = 0;
  const db = {
    auth: { getUser: async () => ({ data: { user: { id: "other" } } }) },
    from: () => ({ select: () => ({ eq: (column, value) => {
      assert.equal(column, "id"); assert.equal(value, job.id);
      return { eq: (column, value) => {
        assert.equal(column, "user_id"); assert.equal(value, "other");
        return { maybeSingle: async () => ({ data: null }) };
      } };
    } }) }),
    storage: { from: () => { reads++; throw new Error("Unauthorized cache read"); } },
  };
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await createPreviewHandler(() => db)({ method: "GET", headers: { authorization: "Bearer test" }, query: { jobId: job.id } }, res);
  assert.equal(res.code, 404);
  assert.equal(reads, 0);
  await createPreviewHandler(() => db)({ method: "GET", headers: {}, query: { jobId: job.id } }, res);
  assert.equal(res.code, 401);
  assert.equal(reads, 0);
});

test("maintenance warming requires the existing server signature and exposes only statistics", async () => {
  const fixture = await storageFixture();
  fixture.db.from = () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: job }) }) }) });
  fixture.db.rpc = async () => ({ data: true });
  const res = { setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; }, end() { return this; } };
  await handlePreviewMaintenance({ method: "GET", headers: {}, query: { jobId: job.id } }, res, fixture.db);
  assert.equal(res.code, 401); assert.equal(fixture.originals(), 0);
  const req = { method: "GET", headers: { "x-dispatch-timestamp": "1791000000", "x-dispatch-signature": "a".repeat(64) }, query: { jobId: job.id } };
  await handlePreviewMaintenance(req, res, fixture.db);
  assert.equal(res.code, 200); assert.equal(res.body.cache, "miss");
  assert.deepEqual(Object.keys(res.body).sort(), ["jobId", "cache", "bytes", "durationMs"].sort());
  await handlePreviewMaintenance(req, res, fixture.db);
  assert.equal(res.body.cache, "hit"); assert.equal(fixture.originals(), 1);
});
