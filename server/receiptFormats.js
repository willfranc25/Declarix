import { createHash } from "node:crypto";
import { documentErrors } from "../src/utils/documentRules.js";

const choice = (value, allowed, fallback) => allowed.includes(value) ? value : fallback;
const sections = ["header", "merchant", "payment", "items", "totals", "tax_stamp", "footer"];
export function formatProfile(raw, document, mimeType) {
  const value = raw && typeof raw === "object" ? raw : {};
  // Retain static layout attributes only; never identifiers, card digits or OCR text.
  const brand = typeof value.brand === "string" ? value.brand.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return {
    version: 1,
    brand: brand || "unknown",
    documentType: document.documentType || "Otro",
    source: /xml$/.test(mimeType) ? "xml" : mimeType === "application/pdf" ? "pdf" : "image",
    layout: choice(value.layout, ["thermal", "a4", "handwritten", "digital"], "unknown"),
    processor: choice(value.processor, ["getnet", "transbank", "mercadopago", "sumup", "other", "none"], "unknown"),
    folioLabel: choice(value.folioLabel, ["bol_electronica", "boleta_electronica", "factura_electronica", "folio", "numero_documento", "none", "other"], "unknown"),
    sections: Array.isArray(value.sections) ? [...new Set(value.sections.filter(s => sections.includes(s)))].slice(0, 7) : [],
  };
}
export function formatEntry(raw, document, mimeType, index) {
  const profile = formatProfile(raw, document, mimeType);
  const issues = Object.keys(documentErrors(document)).map(key => `field:${key}`);
  if (document.folioReview) issues.push(`folio:${document.folioReview.reason}`);
  if (profile.layout === "unknown" && profile.source !== "xml") issues.push("layout_unknown");
  if (profile.documentType === "Otro") issues.push("document_type_unknown");
  return {
    index, profile, issues: [...new Set(issues)],
    fingerprint: createHash("sha256").update(JSON.stringify(profile)).digest("hex"),
  };
}
export const FORMAT_PROMPT = `Agrega también formatProfile a cada documento, solo para diagnóstico interno, sin datos de la compra: {brand,layout,processor,folioLabel,sections}. brand: marca o cadena impresa (p.ej. shell, copec, lider), nunca nombre de persona, RUT, dirección, monto o fecha; null si no hay marca. layout: thermal|a4|handwritten|digital. processor: getnet|transbank|mercadopago|sumup|other|none. folioLabel: bol_electronica|boleta_electronica|factura_electronica|folio|numero_documento|none|other según el rótulo impreso, no su número. sections: lista de header|merchant|payment|items|totals|tax_stamp|footer en orden de aparición. Describe el diseño estable, no los valores variables. Si hay boleta electrónica explícita junto al pago, conserva su folio; solo un voucher sin folio tributario usa documentNumber="0000".`;

export async function recordReceiptFormats(db, job, entries) {
  try {
    const { error } = await db.rpc("record_receipt_formats", {
      p_job: job.id, p_lease: job.lease_token, p_entries: entries,
    });
    if (error) throw error;
  } catch {
    // An unavailable diagnostic inbox must not fail an already completed receipt.
    console.error("[receipt-formats] registration failed", { jobId: job.id });
  }
}
