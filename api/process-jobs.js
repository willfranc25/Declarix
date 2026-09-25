import { timingSafeEqual } from "node:crypto";
import { adminClient } from "../server/admin.js";
import { runOne, cleanupAbandoned } from "../server/worker.js";
export const config = { maxDuration: 120 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const expected = "Bearer " + (process.env.CRON_SECRET || "");
  const given = req.headers.authorization || "";
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(given) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    return res.status(401).end();
  try {
    const db = adminClient();
    await cleanupAbandoned(db);
    return res.status(200).json(await runOne(db));
  } catch {
    return res.status(503).json({ error: "WORKER_UNAVAILABLE" });
  }
}
