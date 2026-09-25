import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { inspectDocument, parseDTE } from "./documentInput.js";
import { retrySeconds, runOne } from "./worker.js";
const xml =
  "<DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>10</Folio><FchEmis>2026-01-01</FchEmis></IdDoc><Emisor><RUTEmisor>76123456-0</RUTEmisor><RznSoc>Empresa</RznSoc></Emisor><Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales></Encabezado></Documento></DTE>";
test("XML extracts deterministic DTE data and rejects external entities", () => {
  assert.equal(parseDTE(xml)[0].totalAmount, 1190);
  assert.throws(
    () =>
      parseDTE(
        '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///etc/passwd">]>' + xml,
      ),
    /INVALID_FILE/,
  );
});
test("PDF pages are counted server-side and invalid signatures rejected", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  assert.equal(
    (await inspectDocument(Buffer.from(await pdf.save()), "application/pdf"))
      .pages,
    2,
  );
  await assert.rejects(
    () => inspectDocument(Buffer.from("fake image"), "image/png"),
    /INVALID_FILE/,
  );
});
test("provider retry respects Retry-After and does not retry permanent 400 errors", () => {
  assert.ok(retrySeconds(429, 1, "120") >= 120);
  assert.equal(retrySeconds(400, 1), null);
});
test("durable worker records an XML result without calling a model", async () => {
  const calls = [];
  const job = {
    id: "job",
    user_id: "user",
    organization_id: "company",
    object_path: "path",
    mime_type: "application/xml",
    lease_token: "lease",
    attempts: 1,
  };
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [job] : true, error: null };
    },
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([xml]), error: null }),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { provider_rules: {} }, error: null }),
        }),
      }),
    }),
  };
  const result = await runOne(db, {
    userId: "user",
    fetchImpl: () => {
      throw new Error("Must not call external AI");
    },
  });
  assert.equal(result.status, "ready");
  assert.deepEqual(calls.find((c) => c[0] === "claim_extraction")[1], {
    p_user: "user",
  });
  const finish = calls.find((c) => c[0] === "finish_extraction")[1];
  assert.equal(finish.p_result.documents[0].documentNumber, "10");
  assert.equal(finish.p_metrics.estimatedUsd, 0);
});
test("worker releases a failed request through the finish RPC, with retry metadata", async () => {
  const calls = [];
  const job = {
    id: "job",
    mime_type: "image/png",
    object_path: "path",
    lease_token: "lease",
    attempts: 1,
  };
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [job] : true, error: null };
    },
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob(["bytes"]), error: null }),
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { provider_rules: {} }, error: null }),
        }),
      }),
    }),
  };
  process.env.GEMINI_API_KEY = "test-key";
  const result = await runOne(db, {
    fetchImpl: async () =>
      new Response("", { status: 429, headers: { "retry-after": "90" } }),
  });
  delete process.env.GEMINI_API_KEY;
  assert.equal(result.status, "queued");
  const finish = calls.find((c) => c[0] === "finish_extraction")[1];
  assert.equal(finish.p_result, null);
  assert.ok(finish.p_retry_seconds >= 90);
  assert.equal(finish.p_error, "PROVIDER_429");
});

