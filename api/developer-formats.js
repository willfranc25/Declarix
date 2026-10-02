import { adminClient, respondError } from "../server/admin.js";
import { handleDeveloperFormats } from "../server/developerFormats.js";
export default async function handler(req, res) {
  try { return await handleDeveloperFormats(req, res, adminClient()); }
  catch (err) { res.setHeader("Cache-Control", "no-store"); return respondError(res, err); }
}
