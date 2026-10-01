import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFocusedReading, normalizeElectronicFolio, supportedFolio } from "./focusedReading.js";
import { normalizeDocumentType } from "../src/utils/documentRules.js";

test("folio requires a document label, not a payment operation", () => {
  assert.equal(supportedFolio("261561", "BOLETA ELECTRONICA 261561"), true);
  assert.equal(supportedFolio("000261561", "Folio N° 000261561"), true);
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
});

test("electronic folios are numeric and at most ten digits", () => {
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "313.201.234" }).documentNumber, null);
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "001322303900" }).documentNumber, null);
  assert.equal(normalizeElectronicFolio({ documentType: "Boleta Electrónica", documentNumber: "Operación 451627" }).documentNumber, null);
});
