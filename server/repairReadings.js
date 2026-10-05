import { checked, uuid } from "./admin.js";
import { schedulerAuthorized } from "./schedulerAuth.js";
import { FOCUSED_PROMPT } from "./focusedReading.js";
import { readIdentifiers } from "./identifierReading.js";
import { imageForModel, identifierCloseups, folioVerificationImages } from "./modelImage.js";
import { validateRut } from "../src/utils/rutValidator.js";

// Operations-only repair of pending identifiers. No original images, URLs,
// receipt values or keys are returned. Customer corrections stay in `review`.
export async function handleReadingRepair(req, res, db, fetchImpl = fetch) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!await schedulerAuthorized(req.headers, db, process.env.CRON_SECRET)) return res.status(401).end();
  const jobId = req.body?.jobId;
  if (!uuid(jobId)) return res.status(400).json({ error: "INVALID_JOB" });
  try {
    const job = checked(await db.from("extraction_jobs").select("id,mime_type,object_path,status,result")
      .eq("id", jobId).maybeSingle());
    if (!job || job.status !== "ready" || !job.mime_type?.startsWith("image/") || job.result?.documents?.length !== 1)
      return res.status(409).json({ error: "NOT_PENDING_IMAGE" });
    const saved = checked(await db.from("invoices").select("id").eq("source_job_id", jobId).limit(1));
    if (saved.length) return res.status(409).json({ error: "ALREADY_SAVED" });
    const control = checked(await db.rpc("identifier_repair_control"));
    const spent = control.budget_day === new Date().toISOString().slice(0, 10) ? Number(control.spent_today) : 0;
    if (control.paused || spent + Number(control.reserved_usd) + Number(control.attempt_reservation_usd) > Number(control.daily_budget_usd))
      return res.status(429).json({ error: "AI_BUDGET" });
    if (!process.env.OPENROUTER_API_KEY) return res.status(503).json({ error: "PROVIDER_NOT_CONFIGURED" });
    const original = checked(await db.storage.from("documents").download(job.object_path));
    const bytes = Buffer.from(await original.arrayBuffer());
    const input = await imageForModel(bytes, job.mime_type);
    const context = { type: "image_url", image_url: { url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}` } };
    const doc = job.result.documents[0];
    const crops = await identifierCloseups(bytes, job.mime_type, doc.fieldLocations).catch(() => []);
    const started = Date.now();
    const metrics = { model: "google/gemini-3.1-flash-lite", promptTokens: 0, outputTokens: 0, estimatedUsd: 0 };
    const read = async extra => {
      const attachments = [context, ...crops];
      if (extra) attachments.push(...await folioVerificationImages(bytes, job.mime_type).catch(() => []));
      // Charge conservatively if the response is lost after the provider accepted it.
      const allowance = Number(control.attempt_reservation_usd);
      metrics.estimatedUsd += allowance;
      const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(Math.max(1000, 45_000 - (Date.now() - started))),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` },
        body: JSON.stringify({ model: metrics.model, messages: [{ role: "user", content: [{ type: "text", text: FOCUSED_PROMPT }, ...attachments] }] }),
      });
      if (!response.ok) {
        if ([400, 401, 402, 403, 404, 413, 422, 429].includes(response.status)) metrics.estimatedUsd -= allowance;
        throw new Error("IDENTIFIER_PROVIDER_ERROR");
      }
      const body = await response.json(), usage = body.usage || {};
      metrics.promptTokens += usage.prompt_tokens || 0;
      metrics.outputTokens += usage.completion_tokens || 0;
      metrics.estimatedUsd -= allowance;
      metrics.estimatedUsd += Number.isFinite(usage.cost) && usage.cost >= 0 ? usage.cost :
        Number.isFinite(usage.prompt_tokens) && Number.isFinite(usage.completion_tokens)
          ? (usage.prompt_tokens * 0.25 + usage.completion_tokens * 1.5) / 1e6 : Number(control.attempt_reservation_usd);
      const content = body.choices?.[0]?.message?.content;
      if (body.choices?.[0]?.finish_reason !== "stop" || typeof content !== "string") throw new Error("INVALID_READING");
      return JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ""));
    };
    const verified = await readIdentifiers(doc, read, () => Date.now() - started < 33_000);
    // Only change identifiers, never dates, amounts, supplier names or classification.
    const replacement = { ...doc, providerRut: verified.document.providerRut,
      documentNumber: verified.document.documentNumber, folioReview: verified.document.folioReview || null };
    const result = { ...job.result, documents: [replacement] };
    // Only the service can read this audit. Retain bounded printed evidence to
    // distinguish a bad OCR read from an unrecognized label; never log it publicly.
    const identifierReadings = verified.readings.map(reading => Object.fromEntries(
      ["providerRut", "rutEvidence", "documentNumber", "folioEvidence", "typeEvidence"].map(key =>
        [key, typeof reading?.[key] === "string" ? reading[key].slice(0, 500) : null])));
    const updated = checked(await db.rpc("commit_identifier_repair", {
      p_job: jobId, p_expected: job.result, p_result: result, p_metrics: { ...metrics, identifierReadings },
    }));
    return res.status(200).json({ jobId, updated, attempts: verified.readings.length,
      rutValid: validateRut(replacement.providerRut || ""), folioResolved: !replacement.folioReview && !!replacement.documentNumber,
      estimatedUsd: metrics.estimatedUsd });
  } catch {
    console.error("[identifier-reading] repair failed", { jobId, reason: "REPAIR_UNAVAILABLE" });
    return res.status(500).json({ error: "REPAIR_UNAVAILABLE" });
  }
}
