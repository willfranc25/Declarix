import { authenticate, checked, uuid, respondError } from "./admin.js";

export async function handleDeveloperFormats(req, res, db) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Vary", "Authorization");
  if (req.method !== "POST") return res.status(405).json({ error: "Usa POST" });
  try {
    const user = await authenticate(req, db);
    const allowed = checked(await db.rpc("developer_format_access", { p_user: user.id }));
    const { action, status = "", page = 1, fingerprint, notes = "", jobId, index } = req.body || {};
    if (action === "access") return res.status(200).json({ allowed: allowed === true });
    if (allowed !== true) return res.status(403).json({ error: "Acceso exclusivo del desarrollador." });
    if (action === "list") {
      if (!Number.isInteger(page) || page < 1 || page > 100000 || !["", "new", "needs_review", "reviewed", "ignored"].includes(status))
        return res.status(400).json({ error: "Filtro inválido." });
      return res.status(200).json(checked(await db.rpc("developer_format_inbox", {
        p_user: user.id, p_status: status, p_offset: (page - 1) * 25,
      })));
    }
    if (action === "review") {
      if (typeof fingerprint !== "string" || !/^[a-f0-9]{64}$/.test(fingerprint) ||
          !["needs_review", "reviewed", "ignored"].includes(status) || typeof notes !== "string" || notes.length > 2000)
        return res.status(400).json({ error: "Revisión inválida." });
      const updated = checked(await db.rpc("review_receipt_format", {
        p_user: user.id, p_fingerprint: fingerprint, p_status: status, p_notes: notes.trim(),
      }));
      return res.status(updated ? 200 : 404).json({ updated });
    }
    if (action === "sample") {
      if (!uuid(jobId) || !Number.isInteger(index) || index < -1 || index > 99)
        return res.status(400).json({ error: "Ejemplo inválido." });
      const sample = checked(await db.rpc("developer_format_sample", { p_user: user.id, p_job: jobId, p_index: index }));
      if (!sample) return res.status(404).json({ error: "Ejemplo no disponible." });
      const { path, ...metadata } = sample;
      const signed = checked(await db.storage.from("documents").createSignedUrl(path, 600));
      return res.status(200).json({ ...metadata, url: signed.signedUrl });
    }
    return res.status(400).json({ error: "Acción inválida." });
  } catch (err) {
    return respondError(res, err);
  }
}
