import { timingSafeEqual } from "node:crypto";
import { adminClient } from "../server/admin.js";
import { runOne, cleanupAbandoned } from "../server/worker.js";
export const config = { maxDuration: 60 };
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const db = adminClient();
  if (req.method === "POST") {
    const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    if (!token) return res.status(401).end();
    try {
      const { data, error } = await db.auth.getUser(token);
      if (error || !data.user) return res.status(401).end();
      const started = Date.now();
      let processed = 0;
      while (processed < 25 && Date.now() - started < 50_000) {
        const result = await runOne(db, {
          userId: data.user.id,
          timeoutMs: 40_000,
        });
        if (!result.worked) break;
        processed++;
      }
      return res.status(200).json({ worked: processed > 0, processed });
    } catch {
      return res.status(503).json({ error: "WORKER_UNAVAILABLE" });
    }
  }
  if (req.method !== "GET") return res.status(405).end();
  const expected = "Bearer " + (process.env.CRON_SECRET || "");
  const given = req.headers.authorization || "";
  if (
    !process.env.CRON_SECRET ||
    Buffer.byteLength(given) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    return res.status(401).end();
  try {
    await cleanupAbandoned(db);
    return res.status(200).json(await runOne(db));
  } catch {
    return res.status(503).json({ error: "WORKER_UNAVAILABLE" });
  }
}

