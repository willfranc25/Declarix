import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import { inspectDocument, parseDTE } from "./documentInput.js";
import { retrySeconds, runOne, validFieldLocations } from "./worker.js";
const xml =
  "<DTE><Documento><Encabezado><IdDoc><TipoDTE>33</TipoDTE><Folio>10</Folio><FchEmis>2026-01-01</FchEmis></IdDoc><Emisor><RUTEmisor>76123456-0</RUTEmisor><RznSoc>Empresa</RznSoc></Emisor><Totales><MntNeto>1000</MntNeto><IVA>190</IVA><MntTotal>1190</MntTotal></Totales></Encabezado></Documento></DTE>";
test("field positions keep only bounded boxes for supported receipt fields", () => {
  assert.deepEqual(validFieldLocations({
    documentNumber: { x: 100, y: 200, width: 180, height: 30 },
    totalAmount: { x: 900, y: 950, width: 200, height: 60 },
    unknown: { x: 1, y: 1, width: 1, height: 1 },
  }), { documentNumber: { x: 100, y: 200, width: 180, height: 30 } });
});
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
  process.env.OPENROUTER_API_KEY = "test-key";
  const result = await runOne(db, {
    fetchImpl: async () =>
      new Response("", { status: 429, headers: { "retry-after": "90" } }),
  });
  delete process.env.OPENROUTER_API_KEY;
  assert.equal(result.status, "queued");
  const finish = calls.find((c) => c[0] === "finish_extraction")[1];
  assert.equal(finish.p_result, null);
  assert.ok(finish.p_retry_seconds >= 90);
  assert.equal(finish.p_error, "PROVIDER_429");
});

test("provider validation rejects do not spend the daily processing budget", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [{
        id: "job", organization_id: "company", mime_type: "image/jpeg",
        object_path: "path", lease_token: "lease", attempts: 1,
      }] : true, error: null };
    },
    storage: { from: () => ({
      download: async () => ({ data: new Blob(["image"]), error: null }),
    }) },
    from: () => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { provider_rules: {} }, error: null }),
    }) }) }),
  };
  const originalLog = console.error;
  console.error = () => {};
  process.env.OPENROUTER_API_KEY = "test-key";
  try {
    const result = await runOne(db, {
      fetchImpl: async () => Response.json({ error: { message: "bad schema" } }, { status: 400 }),
    });
    assert.equal(result.status, "failed");
    const finish = calls.find((c) => c[0] === "finish_extraction")[1];
    assert.equal(finish.p_error, "PROVIDER_400");
    assert.equal(finish.p_metrics.estimatedUsd, 0);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
    console.error = originalLog;
  }
});

test("a plausible photo folio receives an independent second reading", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [{
        id: "job", organization_id: "company", mime_type: "image/jpeg",
        object_path: "path", lease_token: "lease", attempts: 1,
      }] : true, error: null };
    },
    storage: { from: () => ({
      download: async () => ({ data: new Blob(["image"]), error: null }),
    }) },
    from: () => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { provider_rules: {} }, error: null }),
    }) }) }),
  };
  process.env.OPENROUTER_API_KEY = "test-key";
  let requests = 0;
  try {
    const result = await runOne(db, { fetchImpl: async (_url, options) => {
      requests++;
      const request = JSON.parse(options.body);
      assert.equal(request.response_format, undefined);
      assert.equal(request.reasoning, undefined);
      if (requests === 1) assert.match(request.messages[0].content[0].text, /documents/);
      else assert.match(request.messages[0].content[0].text, /Relee de forma independiente/);
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: requests === 1
          ? '```json\n{"documents":[{"providerName":"Empresa","providerRut":"76123456-0","documentType":"factura","documentNumber":"10","date":"2026-01-01","totalAmount":1190}]}\n```'
          : '{"documentNumber":"10","folioEvidence":"Factura N° 10"}' } }],
        usage: { prompt_tokens: 100, completion_tokens: 30, cost: 0.0001 },
      });
    } });
    assert.equal(result.status, "ready");
    assert.equal(requests, 2);
    const finish = calls.find((c) => c[0] === "finish_extraction")[1];
    assert.equal(finish.p_metrics.estimatedUsd, 0.0002);
    assert.equal(finish.p_result.documents[0].totalAmount, 1190);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test("worker rereads a questionable RUT and missing folio without replacing other fields", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [{
        id: "job", organization_id: "company", mime_type: "image/jpeg",
        object_path: "path", lease_token: "lease", attempts: 1,
      }] : true, error: null };
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(["image"]), error: null }) }) },
    from: () => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { provider_rules: {} }, error: null }),
    }) }) }),
  };
  process.env.OPENROUTER_API_KEY = "test-key";
  let requests = 0;
  try {
    await runOne(db, { fetchImpl: async () => {
      requests++;
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: requests === 1
          ? JSON.stringify({ documents: [{ providerName: "REYES & VALENCIA SPA", providerRut: "77217795-2", documentType: "factura", documentNumber: null, date: "2026-09-09", totalAmount: 7000 }] })
          : JSON.stringify({ providerRut: "77.217.995-2", documentNumber: "261561", folioEvidence: "BOLETA ELECTRONICA 261561", typeEvidence: "BOLETA ELECTRONICA 261561" }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
      });
    } });
    assert.equal(requests, 2);
    const finish = calls.find((c) => c[0] === "finish_extraction")[1];
    assert.equal(finish.p_result.documents[0].providerRut, "77.217.995-2");
    assert.equal(finish.p_result.documents[0].documentNumber, "261561");
    assert.equal(finish.p_result.documents[0].documentType, "Boleta Electrónica");
    assert.equal(finish.p_result.documents[0].totalAmount, 7000);
    assert.equal(finish.p_metrics.estimatedUsd, 0.0002);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

test("worker does not silently accept a 3/8 folio disagreement", async () => {
  const calls = [];
  const db = {
    rpc: async (name, args) => {
      calls.push([name, args]);
      return { data: name === "claim_extraction" ? [{
        id: "job", organization_id: "company", mime_type: "image/jpeg",
        object_path: "path", lease_token: "lease", attempts: 1,
      }] : true, error: null };
    },
    storage: { from: () => ({ download: async () => ({ data: new Blob(["image"]), error: null }) }) },
    from: () => ({ select: () => ({ eq: () => ({
      single: async () => ({ data: { provider_rules: {} }, error: null }),
    }) }) }),
  };
  process.env.OPENROUTER_API_KEY = "test-key";
  let requests = 0;
  try {
    await runOne(db, { fetchImpl: async () => {
      requests++;
      return Response.json({
        choices: [{ finish_reason: "stop", message: { content: requests === 1
          ? JSON.stringify({ documents: [{ providerName: "COPEC", providerRut: "76464286-4",
            documentType: "Boleta Electrónica", documentNumber: "3485367",
            date: "2026-09-21", totalAmount: 40205 }] })
          : JSON.stringify({ documentNumber: "3485867", folioEvidence: "Boleta Electrónica 3485867" }) } }],
        usage: { prompt_tokens: 100, completion_tokens: 20, cost: 0.0001 },
      });
    } });
    assert.equal(requests, 2);
    const doc = calls.find((c) => c[0] === "finish_extraction")[1].p_result.documents[0];
    assert.equal(doc.documentNumber, null);
    assert.deepEqual(doc.folioReview, { first: "3485367", second: "3485867", reason: "mismatch" });
    assert.equal(doc.totalAmount, 40205);
  } finally {
    delete process.env.OPENROUTER_API_KEY;
  }
});

for (const mimeType of ["image/png", "application/pdf"]) {
  test(`worker sends ${mimeType} through OpenRouter and records billed cost`, async () => {
    const calls = [];
    const job = {
      id: "job", organization_id: "company", mime_type: mimeType,
      object_path: "path", lease_token: "lease", attempts: 1,
    };
    const db = {
      rpc: async (name, args) => {
        calls.push([name, args]);
        return { data: name === "claim_extraction" ? [job] : true, error: null };
      },
      storage: { from: () => ({
        download: async () => ({ data: new Blob(["fixture"]), error: null }),
      }) },
      from: () => ({ select: () => ({ eq: () => ({
        single: async () => ({ data: { provider_rules: {} }, error: null }),
      }) }) }),
    };
    process.env.OPENROUTER_API_KEY = "test-key";
    let requests = 0;
    try {
      const result = await runOne(db, { fetchImpl: async (url, options) => {
        requests++;
        assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
        assert.equal(options.headers.Authorization, "Bearer test-key");
        const request = JSON.parse(options.body);
        assert.equal(request.model, "google/gemini-3.1-flash-lite");
        assert.equal(request.response_format, undefined);
        assert.equal(request.provider, undefined);
        assert.equal(request.reasoning, undefined);
        if (requests === 1) assert.match(request.messages[0].content[0].text, /documents/);
        else assert.match(request.messages[0].content[0].text, /Relee de forma independiente/);
        const attachment = request.messages[0].content[1];
        if (mimeType === "application/pdf") {
          assert.equal(attachment.type, "file");
          assert.match(attachment.file.file_data, /^data:application\/pdf;base64,/);
        } else {
          assert.equal(attachment.type, "image_url");
          assert.match(attachment.image_url.url, /^data:image\/png;base64,/);
        }
        return Response.json({
          choices: [{ finish_reason: "stop", message: { content: requests === 1
            ? JSON.stringify({ documents: [{
              providerName: "Empresa", providerRut: "76123456-0", documentType: "factura",
              documentNumber: "10", date: "2026-01-01", netAmount: 1000,
              ivaAmount: 190, totalAmount: 1190,
            }] })
            : JSON.stringify({ documentNumber: "10", folioEvidence: "Factura N° 10" }) } }],
          usage: { prompt_tokens: 1000, completion_tokens: 200, cost: 0.0007,
            completion_tokens_details: { reasoning_tokens: 10 } },
        });
      } });
      assert.equal(result.status, "ready");
      const finish = calls.find((c) => c[0] === "finish_extraction")[1];
      assert.equal(finish.p_metrics.model, "google/gemini-3.1-flash-lite");
      assert.equal(finish.p_metrics.estimatedUsd, mimeType === "image/png" ? 0.0014 : 0.0007);
      assert.equal(finish.p_metrics.thinkingTokens, mimeType === "image/png" ? 20 : 10);
      assert.equal(finish.p_result.documents[0].totalAmount, 1190);
    } finally {
      delete process.env.OPENROUTER_API_KEY;
    }
  });
}

