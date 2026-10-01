import { timingSafeEqual } from "node:crypto";

export async function schedulerAuthorized(headers, db, cronSecret) {
  const given = headers.authorization || "";
  const expected = `Bearer ${cronSecret || ""}`;
  if (
    cronSecret &&
    Buffer.byteLength(given) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(given), Buffer.from(expected))
  )
    return true;

  const timestamp = headers["x-dispatch-timestamp"];
  const signature = headers["x-dispatch-signature"];
  if (
    typeof timestamp !== "string" ||
    !/^\d{10}$/.test(timestamp) ||
    typeof signature !== "string" ||
    !/^[0-9a-f]{64}$/.test(signature)
  )
    return false;

  const { data, error } = await db.rpc("verify_background_dispatch", {
    p_timestamp: timestamp,
    p_signature: signature,
  });
  return !error && data === true;
}
