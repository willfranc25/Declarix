import { adminClient } from "../server/admin.js";
import { handlePreviewMaintenance } from "../server/previewMaintenance.js";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  try { return await handlePreviewMaintenance(req, res, adminClient()); }
  catch { return res.status(503).json({ error: "PREVIEW_UNAVAILABLE" }); }
}
