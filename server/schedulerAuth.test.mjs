import { test } from "node:test";
import assert from "node:assert/strict";
import { schedulerAuthorized } from "./schedulerAuth.js";

test("Vercel's daily cron secret authorizes without a database lookup", async () => {
  const db = { rpc: () => { throw new Error("unexpected RPC"); } };
  assert.equal(
    await schedulerAuthorized({ authorization: "Bearer daily-secret" }, db, "daily-secret"),
    true,
  );
});

test("a signed background dispatch requires the database verifier", async () => {
  const signature = "a".repeat(64);
  const calls = [];
  const db = { rpc: async (...args) => {
    calls.push(args);
    return { data: true, error: null };
  } };
  assert.equal(await schedulerAuthorized({
    "x-dispatch-timestamp": "1790819900",
    "x-dispatch-signature": signature,
  }, db), true);
  assert.deepEqual(calls, [["verify_background_dispatch", {
    p_timestamp: "1790819900",
    p_signature: signature,
  }]]);
});

test("invalid signatures and database errors never authorize processing", async () => {
  const db = { rpc: async () => ({ data: null, error: new Error("offline") }) };
  assert.equal(await schedulerAuthorized({ "x-dispatch-timestamp": "1", "x-dispatch-signature": "a".repeat(64) }, db), false);
  assert.equal(await schedulerAuthorized({ "x-dispatch-timestamp": "1790819900", "x-dispatch-signature": "a".repeat(64) }, db), false);
  assert.equal(await schedulerAuthorized({ authorization: "Bearer bad" }, db, "daily-secret"), false);
});
