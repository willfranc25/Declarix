import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readIdentifiers } from './identifierReading.js';
import { supportedFolio, supportedRut } from './focusedReading.js';

const receipt = { providerRut: '99568810-7', documentType: 'Boleta Electrónica', documentNumber: '583965', totalAmount: 4800 };
const reading = (number = '583965') => ({ documentNumber: number, folioEvidence: `BOLETA ELECTRONICA AFECTA:${number}` });

test('accepts afecta/exenta labels, separators and keeps printed leading zeros', () => {
  for (const label of ['BOLETA ELECTRONICA AFECTA:', 'Boleta No Afecta o Exenta Electrónica N°', 'Bol. Electronica:', 'Folio:'])
    assert.equal(supportedFolio('000583965', `${label} 000583.965`), true, label);
  assert.equal(supportedFolio('583965', 'Caja 02; BOLETA ELECTRONICA AFECTA:583965'), true);
  assert.equal(supportedFolio('583965', 'VÁLIDO COMO BOLETA 583965'), false);
  assert.equal(supportedFolio('583965', 'Operación 583965'), false);
});

test('recovers existing inconclusive result from supported matching reread', async () => {
  const input = { ...receipt, documentNumber: null, folioReview: { first: '583965', reason: 'inconclusive', second: null } };
  const result = await readIdentifiers(input, async () => reading());
  assert.equal(result.readings.length, 1);
  assert.equal(result.document.documentNumber, '583965');
  assert.equal(result.document.folioReview, null);
  assert.equal(input.documentNumber, null);
});

test('uses third close-up only after failed verification, with two agreeing supported readings', async () => {
  const calls = [];
  const result = await readIdentifiers({ ...receipt, documentNumber: '583365' }, async extra => {
    calls.push(extra); return reading();
  });
  assert.deepEqual(calls, [false, true]);
  assert.equal(result.document.documentNumber, '583965');
  assert.equal(result.document.folioReview, null);
  assert.equal(result.document.totalAmount, 4800);
});

test('inconclusive or unsupported third read cannot bypass the folio mismatch', async () => {
  for (const third of [{ documentNumber: null }, { documentNumber: '583965', folioEvidence: 'Operación 583965' }]) {
    const result = await readIdentifiers({ ...receipt, documentNumber: '583365' }, async extra => extra ? third : reading());
    assert.equal(result.document.documentNumber, null);
    assert.equal(result.document.folioReview.reason, 'mismatch');
  }
});

test('deadline or failed extra reading preserves prior results and manual review', async () => {
  const result = await readIdentifiers(receipt, async () => ({ documentNumber: null }), () => false);
  assert.equal(result.readings.length, 1);
  assert.equal(result.document.folioReview.reason, 'inconclusive');
  const failed = await readIdentifiers(receipt, async extra => { if (extra) throw new Error('timeout'); return {}; });
  assert.equal(failed.document.folioReview.reason, 'inconclusive');
});

test('RUT correction requires readable RUT evidence plus a valid check digit', async () => {
  assert.equal(supportedRut('77.217.995-2', 'RUT: 77.217.995-2'), true);
  assert.equal(supportedRut('77.217.995-2', 'Terminal: 772179952'), false);
  const voucher = { providerRut: '77217795-2', documentType: 'Comprobante de pago electrónico', documentNumber: '0000' };
  const fixed = await readIdentifiers(voucher, async () => ({ providerRut: '77.217.995-2', rutEvidence: 'RUT: 77.217.995-2' }));
  assert.equal(fixed.document.providerRut, '77.217.995-2');
  assert.equal(fixed.readings.length, 1);
  const unsupported = await readIdentifiers(voucher, async () => ({ providerRut: '77.217.995-2' }));
  assert.equal(unsupported.document.providerRut, voucher.providerRut);
});
