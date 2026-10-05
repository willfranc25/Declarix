import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleReadingRepair } from './repairReadings.js';

const id = 'beac38c3-f24b-48c6-881b-836fed921c34';
const original = { documents: [{ providerName: 'Supplier', providerRut: '99568810-7', documentType: 'Boleta Electrónica', documentNumber: null,
  folioReview: { first: '583965', second: null, reason: 'inconclusive' }, date: '2025-08-02', totalAmount: 4800 }] };
function fixture(saved = []) {
  let commit;
  const db = {
    from: table => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => ({ data: { id, status: 'ready', mime_type: 'image/jpeg', object_path: 'private/path', result: original } }),
      limit: async () => ({ data: table === 'invoices' ? saved : [] }),
    }) }) }),
    storage: { from: () => ({ download: async () => ({ data: new Blob(['image']) }) }) },
    rpc: async (name, args) => {
      if (name === 'identifier_repair_control') return { data: { paused: false, daily_budget_usd: 5, attempt_reservation_usd: 0.5, reserved_usd: 0, spent_today: 0 } };
      commit = args; return { data: true };
    },
  };
  const res = { code: 0, body: null, setHeader() {}, status(code) { this.code = code; return this; }, json(body) { this.body = body; }, end() {} };
  return { db, res, getCommit: () => commit };
}
const request = { method: 'POST', headers: { authorization: 'Bearer test-cron' }, body: { jobId: id } };

test('private repair preserves amounts/dates, uses optimistic expected result and records billed usage', async () => {
  const state = fixture();
  process.env.CRON_SECRET = 'test-cron'; process.env.OPENROUTER_API_KEY = 'test-provider';
  try {
    await handleReadingRepair(request, state.res, state.db, async () => Response.json({ choices: [{ finish_reason: 'stop', message: {
      content: JSON.stringify({ documentNumber: '583965', folioEvidence: 'BOLETA ELECTRONICA AFECTA:583965' }),
    } }], usage: { prompt_tokens: 120, completion_tokens: 50, cost: 0.00012 } }));
    assert.equal(state.res.code, 200);
    const commit = state.getCommit();
    assert.equal(commit.p_result.documents[0].documentNumber, '583965');
    assert.equal(commit.p_result.documents[0].totalAmount, 4800);
    assert.equal(commit.p_result.documents[0].date, '2025-08-02');
    assert.deepEqual(commit.p_expected, original);
    assert.ok(Math.abs(commit.p_metrics.estimatedUsd - 0.00012) < 1e-9);
    assert.equal(JSON.stringify(state.res.body).includes('583965'), false);
    assert.equal(commit.p_metrics.identifierReadings[0].folioEvidence, 'BOLETA ELECTRONICA AFECTA:583965');
  } finally { delete process.env.CRON_SECRET; delete process.env.OPENROUTER_API_KEY; }
});

test('saved receipts and requests without scheduler authorization cannot trigger rereading', async () => {
  const state = fixture([{ id: 'saved' }]);
  process.env.CRON_SECRET = 'test-cron';
  try {
    await handleReadingRepair({ ...request, headers: {} }, state.res, state.db);
    assert.equal(state.res.code, 401);
    await handleReadingRepair(request, state.res, state.db);
    assert.equal(state.res.code, 409);
    assert.equal(state.getCommit(), undefined);
  } finally { delete process.env.CRON_SECRET; }
});

test('unknown network cost is recorded conservatively without losing the pending result', async () => {
  const state = fixture();
  process.env.CRON_SECRET = 'test-cron'; process.env.OPENROUTER_API_KEY = 'test-provider';
  try {
    await handleReadingRepair(request, state.res, state.db, async () => { throw new Error('response lost'); });
    assert.equal(state.res.code, 200);
    assert.equal(state.getCommit().p_metrics.estimatedUsd, 0.5);
    assert.equal(state.res.body.folioResolved, false);
  } finally { delete process.env.CRON_SECRET; delete process.env.OPENROUTER_API_KEY; }
});
