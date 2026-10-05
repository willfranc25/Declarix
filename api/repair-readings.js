import { adminClient } from "../server/admin.js";
import { handleReadingRepair } from "../server/repairReadings.js";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  try { return await handleReadingRepair(req, res, adminClient()); }
  catch { return res.status(503).json({ error: "REPAIR_UNAVAILABLE" }); }
}
