import { test } from "node:test";
import assert from "node:assert/strict";
import { formatEntry, recordReceiptFormats } from "./receiptFormats.js";
const doc = { providerName:"AGASAR SPA",providerRut:"76123456-0",documentType:"Comprobante de pago electrónico",documentNumber:"0000",referenceNumber:"002211",date:"2026-09-16",expenseType:"Combustible",totalAmount:12003 };
const profile = {brand:"SHELL",layout:"thermal",processor:"getnet",folioLabel:"none",sections:["header","merchant","payment","totals","footer"]};
test("format fingerprint groups layout independently of receipt values", () => {
  const first = formatEntry(profile, doc, "image/jpeg", 0);
  const second = formatEntry({...profile,brand:" Shell "}, {...doc,referenceNumber:"001209",providerRut:"77.217.995-2",date:"2026-09-17",totalAmount:30000}, "image/png", 0);
  assert.equal(first.fingerprint,second.fingerprint);
  assert.deepEqual(first.issues,[]);
  assert.notEqual(first.fingerprint,formatEntry({...profile,processor:"transbank"},doc,"image/jpeg",0).fingerprint);
  assert.equal(JSON.stringify(first.profile).includes("76123456"),false);
  assert.equal(JSON.stringify(first.profile).includes("002211"),false);
});
test("unknown layouts and ambiguous folios flag a private investigation", () => {
  const entry = formatEntry(null,{...doc,documentType:"Boleta Electrónica",documentNumber:null,folioReview:{reason:"mismatch"}},"image/jpeg",0);
  assert.ok(entry.issues.includes("field:documentNumber"));
  assert.ok(entry.issues.includes("folio:mismatch"));
  assert.ok(entry.issues.includes("layout_unknown"));
});
test("diagnostic registration failure preserves extracted documents and logs no private values", async () => {
  const messages = [], original = console.error;
  console.error = (...args) => messages.push(args);
  try {
    await recordReceiptFormats({rpc:async()=>({error:{message:"sensitive RUT"}})}, {id:"job",lease_token:"lease"}, []);
    assert.equal(messages.length,1);
    assert.equal(JSON.stringify(messages).includes("sensitive"),false);
  } finally { console.error=original; }
});
