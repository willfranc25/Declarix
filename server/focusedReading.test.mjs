import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFocusedReading, normalizeElectronicFolio, reconcileFolioReading, supportedFolio, supportedOperation, unverifiedFolio } from "./focusedReading.js";
import { normalizeDocumentType } from "../src/utils/documentRules.js";

test("folio requires a document label, not a payment operation", () => {
  assert.equal(supportedFolio("261561", "BOLETA ELECTRONICA 261561"), true);
  assert.equal(supportedFolio("000261561", "Folio N° 000261561"), true);
  assert.equal(supportedFolio("001322303900", "Bol. Electronica: 001322303900"), true);
  assert.equal(supportedFolio("001322303901", "Bol. Electronica: 001322303900"), false);
  assert.equal(supportedFolio("155379", "Aprobación: 155379"), false);
  assert.equal(supportedFolio("20322120", "v2.6.2 451627 - 20322120"), false);
  assert.equal(supportedFolio("177217075749", "Operación #177217075749"), false);
});

test("focused reading fixes photographed RUT only with a valid reread", () => {
  const initial = { providerRut: "77217795-2", documentNumber: null, documentType: "Factura" };
  const fixed = applyFocusedReading(initial, {
    providerRut: "77.217.995-2", documentNumber: "261561",
    folioEvidence: "BOLETA ELECTRONICA 261561",
    typeEvidence: "BOLETA ELECTRONICA 261561",
  });
  assert.equal(fixed.providerRut, "77.217.995-2");
  assert.equal(fixed.documentNumber, "261561");
  assert.equal(fixed.documentType, "Boleta Electrónica");
  assert.deepEqual(initial, { providerRut: "77217795-2", documentNumber: null, documentType: "Factura" });
  assert.equal(applyFocusedReading(initial, { providerRut: "77217795-2", documentNumber: "451627", folioEvidence: "Transacción 451627" }).documentNumber, null);
});

test("document types from the model are canonicalized for the review selector", () => {
  assert.equal(normalizeDocumentType("boleta electrónica"), "Boleta Electrónica");
  assert.equal(normalizeDocumentType("FACTURA ELECTRONICA"), "Factura Electrónica");
  assert.equal(normalizeDocumentType("Boleta no afecta o exenta electrónica"), "Boleta Exenta");
  assert.equal(normalizeDocumentType("Válido como Boleta"), "Comprobante de pago electrónico");
});

test("electronic folios preserve printed leading zeros but allow at most ten significant digits", () => {
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "313.201.234" }).documentNumber, null);
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "001322303900" }).documentNumber, "001322303900");
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "12345678901" }).documentNumber, null);
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "Operación 451627" }).documentNumber, null);
});

test("a disagreeing second read blocks the folio until a person checks the photo", () => {
  const first = { documentType: "Boleta Electrónica", documentNumber: "3485367", providerRut: "76464286-4" };
  const reading = { documentNumber: "3485867", folioEvidence: "Boleta Electrónica 3485867" };
  const checked = reconcileFolioReading(first, reading);
  assert.equal(checked.documentNumber, null);
  assert.deepEqual(checked.folioReview, { first: "3485367", second: "3485867", reason: "mismatch" });
  assert.equal(first.documentNumber, "3485367");
  const same = reconcileFolioReading({ ...first, documentNumber: "001322303900" }, {
    documentNumber: "1322303900", folioEvidence: "Bol. Electronica: 001322303900",
  });
  assert.equal(same.documentNumber, "001322303900");
  const missing = reconcileFolioReading(first, { documentNumber: "3485867", folioEvidence: "Transacción 3485867" });
  assert.equal(missing.folioReview.reason, "inconclusive");
  assert.equal(unverifiedFolio(first).folioReview.reason, "unavailable");
});

test("a voucher can use an explicitly labelled operation without calling it a folio", () => {
  assert.equal(supportedOperation("177217075749", "Operación #177217075749"), true);
  assert.equal(supportedOperation("155379", "Aprobación 155379"), false);
  assert.equal(supportedOperation("001209", "Comprobante: 001209"), true);
  assert.equal(supportedOperation("001209", "N° de Comprobante: 001209"), true);
  assert.equal(supportedOperation("001209", "Aprobación: 861966; Comprobante: 001209"), true);
  assert.equal(supportedOperation("861966", "Aprobación: 861966; Comprobante: 001209"), false);
  assert.equal(supportedOperation("20322122", "Comprobante: 001209; 20322122"), false);
  const voucher = applyFocusedReading({ providerRut: "77.217.995-2", documentType: "Boleta", documentNumber: null, notes: null }, {
    typeEvidence: "VÁLIDO COMO BOLETA", operationNumber: "177217075749",
    operationEvidence: "Operación #177217075749",
  });
  assert.equal(voucher.documentType, "Comprobante de pago electrónico");
  assert.equal(voucher.documentNumber, "0000");
  assert.equal(voucher.referenceNumber, "177217075749");

  const enex = applyFocusedReading({ documentType: "Comprobante de pago electrónico", documentNumber: null }, {
    typeEvidence: "VÁLIDO COMO BOLETA", operationNumber: "001209",
    operationEvidence: "Comprobante: 001209",
  });
  assert.equal(enex.documentNumber, "0000");
  assert.equal(enex.referenceNumber, "001209");
  const uncertain = applyFocusedReading({ documentType: "Boleta", documentNumber: null }, {
    typeEvidence: "VÁLIDO COMO BOLETA", operationNumber: "155379",
    operationEvidence: "Aprobación 155379",
  });
  assert.equal(uncertain.documentType, "Comprobante de pago electrónico");
  assert.equal(uncertain.documentNumber, "0000");
  assert.equal(uncertain.referenceNumber, undefined);
});

test("voucher evidence replaces even a mistaken initial tax folio, while a real separate boleta wins", () => {
  const first = {documentType:"Boleta Electrónica",documentNumber:"155379"};
  assert.equal(reconcileFolioReading(first,{typeEvidence:"VÁLIDO COMO BOLETA"}).documentNumber,"0000");
  const real = reconcileFolioReading({...first,documentNumber:"001322303900"},{typeEvidence:"Bol. Electronica: 001322303900",documentNumber:"001322303900",folioEvidence:"Bol. Electronica: 001322303900"});
  assert.equal(real.documentNumber,"001322303900");
  assert.equal(real.documentType,"Boleta Electrónica");
});
