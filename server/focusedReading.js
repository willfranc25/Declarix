import { validateRut } from "../src/utils/rutValidator.js";
import { normalizeDocumentType } from "../src/utils/documentRules.js";

// A payment operation, terminal or authorization is not an SII folio.
export function supportedFolio(number, evidence) {
  if (typeof number !== "string" || typeof evidence !== "string") return false;
  const folio = number.trim().replace(/^0+(?=\d)/, "");
  const quote = evidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (!/^\d{1,10}$/.test(folio)) return false;
  if (!new RegExp(`(?:^|\\D)0*${folio}(?:\\D|$)`).test(quote)) return false;
  if (/operacion|transaccion|autorizacion|aprobacion|terminal|tarjeta|caja|pedido|orden|serie/.test(quote)) return false;
  return /folio|(?:boleta|factura|nota de credito|nota de debito)(?:\s+(?:electronica|exenta|de honorarios))?\s*(?:n[°ºo.]?\s*)?0*\d/i.test(quote)
    || /(?:n[°ºo.]?|numero)\s*(?:de\s*)?(?:documento|boleta|factura)\s*[:#-]?\s*0*\d/i.test(quote);
}

export function supportedOperation(number, evidence) {
  if (typeof number !== "string" || typeof evidence !== "string") return false;
  const value = number.trim();
  const quote = evidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /^\d{3,20}$/.test(value) &&
    new RegExp(`(?:^|\\D)${value}(?:\\D|$)`).test(quote) &&
    /operacion|transaccion/.test(quote) &&
    !/autorizacion|aprobacion|terminal|comprobante|serie/.test(quote);
}

export function normalizeElectronicFolio(document) {
  if (!/^(?:boleta|factura|nota de)/i.test(document.documentType || "") ||
      !document.documentNumber) return document;
  const value = String(document.documentNumber).trim();
  return { ...document, documentNumber: /^\d{1,10}$/.test(value) ? value : null };
}

export function applyFocusedReading(document, reading) {
  if (!reading || typeof reading !== "object") return document;
  const next = { ...document };
  if (!validateRut(next.providerRut || "") &&
      typeof reading.providerRut === "string" && validateRut(reading.providerRut))
    next.providerRut = reading.providerRut.trim();
  if (!next.documentNumber && supportedFolio(reading.documentNumber, reading.folioEvidence))
    next.documentNumber = reading.documentNumber.trim();
  const label = typeof reading.typeEvidence === "string" ? reading.typeEvidence : "";
  const isVoucher = /v[aá]lido como boleta/i.test(label);
  if (isVoucher && !/^(?:Boleta Electrónica|Factura Electrónica)$/.test(next.documentType || "") &&
      !next.documentNumber) {
    next.documentType = "Comprobante de pago electrónico";
    if (supportedOperation(reading.operationNumber, reading.operationEvidence)) {
      next.documentNumber = reading.operationNumber.trim();
      next.referenceNumber = reading.operationNumber.trim();
      next.notes = [next.notes, "N° de operación del voucher; no es folio tributario."]
        .filter(Boolean).join(" ");
    }
  } else if (/\b(?:boleta|factura|nota de cr[eé]dito|nota de d[eé]bito)\b/i.test(label)) {
    const type = normalizeDocumentType(label);
    if (type) next.documentType = type;
  }
  return next;
}

export const FOCUSED_PROMPT = `Relee cuidadosamente este comprobante chileno, considerando que puede estar de lado o inclinado. Responde solo JSON: {"providerRut":string|null,"documentNumber":string|null,"folioEvidence":string|null,"typeEvidence":string|null,"operationNumber":string|null,"operationEvidence":string|null}.
providerRut: copia el RUT del emisor tal como está impreso (no el del cliente). Verifica mentalmente el dígito verificador módulo 11; si la lectura no coincide, vuelve a mirar los dígitos. No cambies uno solo para forzar un RUT válido; usa null si no se distingue.
documentNumber: busca el folio autorizado de la boleta/factura. Puede verse como «Folio 123», «N° documento 123», «Boleta Electrónica 123», «Factura Electrónica N° 123» o rótulos equivalentes. Copia sus dígitos, sin inventar ni confundirlos con RUT, fechas, serie, número de operación/transacción, terminal, caja, aprobación o autorización de tarjeta. En vouchers «Válido como Boleta» puede no haber folio: usa null si no aparece explícito.
folioEvidence: transcribe literalmente la línea o rótulo que vincula ese número con el documento tributario, o null.
typeEvidence: transcribe literalmente el rótulo del tipo de documento tributario, o null. Si hay una boleta electrónica explícita Y un voucher de pago en la misma foto, prioriza «Boleta Electrónica». Nunca deduzcas «Factura» por haber IVA desglosado.
operationNumber: solo si el papel es un voucher «Válido como Boleta» sin boleta electrónica separada, copia el número de operación o transacción claramente rotulado. Nunca uses el número de aprobación/autorización, terminal, serie o comprobante. Si no lo puedes distinguir, usa null.
operationEvidence: transcribe literalmente el rótulo y el número de operación/transacción, o null.`;
