import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createDocumentPreview, getDocumentPreview, PREVIEW_BUCKET, previewPath } from "./documentPreview.js";
import { createPreviewHandler } from "../api/document-preview.js";

test("review preview is a bounded JPEG while the original remains untouched", async () => {
  const original = await sharp({ create: { width: 2400, height: 3200, channels: 3, background: "white" } })
    .png().toBuffer();
  const preview = await createDocumentPreview(original);
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.format, "jpeg");
  assert.ok(metadata.width <= 1200 && metadata.height <= 1600);
  assert.equal((await sharp(original).metadata()).width, 2400);
});

const job = { id: "11111111-1111-4111-8111-111111111111", user_id: "owner", object_path: "owner/company/source.jpg", status: "ready", mime_type: "image/jpeg" };
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
