import { validateRut } from "../src/utils/rutValidator.js";
import { normalizeDocumentType, withVoucherFolio } from "../src/utils/documentRules.js";

// A payment operation, terminal or authorization is not an SII folio.
function printedFolio(number) {
  if (typeof number !== "string") return false;
  const value = number.trim();
  return /^\d{1,20}$/.test(value) &&
    value.replace(/^0+/, "").length > 0 &&
    value.replace(/^0+/, "").length <= 10;
}

function plainEvidence(evidence) {
  return evidence.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function supportedFolio(number, evidence) {
  if (!printedFolio(number) || typeof evidence !== "string") return false;
  const folio = number.trim().replace(/^0+/, "");
  const quote = plainEvidence(evidence);
  if (/operacion|transaccion|autorizacion|aprobacion|terminal|tarjeta|caja|pedido|orden|serie/.test(quote)) return false;
  const label = /(?:\bfolio\b|\b(?:boleta|bol\.|factura|nota de credito|nota de debito)(?:\s+(?:electronica|exenta|de honorarios))?\b|\b(?:n[°ºo.]?|numero)\s*(?:de\s*)?(?:documento|boleta|factura)\b)/;
  return new RegExp(`${label.source}\\s*(?:n[°ºo.]?\\s*)?[:#-]?\\s*0*${folio}(?!\\d)`).test(quote);
}

export function supportedOperation(number, evidence) {
  if (typeof number !== "string" || typeof evidence !== "string") return false;
  const value = number.trim();
  const quote = plainEvidence(evidence);
  return /^\d{3,20}$/.test(value) &&
    new RegExp(`\\b(?:(?:operacion|transaccion|comprobante)\\s*(?:n[°ºo.]?\\s*)?|(?:n[°ºo.]?|numero)\\s*(?:de\\s*)?(?:operacion|transaccion|comprobante))[:#-]?\\s*${value}(?!\\d)`).test(quote) &&
    !/folio|boleta electronica|factura electronica/.test(quote);
}

export function normalizeElectronicFolio(document) {
  if (!/^(?:boleta|factura|nota de)/i.test(document.documentType || "") ||
      !document.documentNumber) return document;
  const value = String(document.documentNumber).trim();
  return { ...document, documentNumber: printedFolio(value) ? value : null };
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
  if (isVoucher && !supportedFolio(reading.documentNumber, reading.folioEvidence)) {
    next.documentType = "Comprobante de pago electrónico";
    if (supportedOperation(reading.operationNumber, reading.operationEvidence)) {
      next.referenceNumber = reading.operationNumber.trim();
    }
  } else if (/\b(?:boleta|factura|nota de cr[eé]dito|nota de d[eé]bito)\b/i.test(label)) {
    const type = normalizeDocumentType(label);
    if (type) next.documentType = type;
  }
  return withVoucherFolio(next);
}

export function reconcileFolioReading(document, reading) {
  const next = applyFocusedReading(document, reading);
  if (next.documentType === "Comprobante de pago electrónico") return next;
  if (!document.documentNumber || !/^(?:boleta|factura|nota de)/i.test(document.documentType || ""))
    return next;
  const first = String(document.documentNumber).trim();
  const second = supportedFolio(reading?.documentNumber, reading?.folioEvidence)
    ? reading.documentNumber.trim() : null;
  if (second && first.replace(/^0+(?=\d)/, "") === second.replace(/^0+(?=\d)/, ""))
    return next;
  return {
    ...next,
    documentNumber: null,
    folioReview: { first, second, reason: second ? "mismatch" : "inconclusive" },
  };
}

export function unverifiedFolio(document) {
  if (!document.documentNumber || !/^(?:boleta|factura|nota de)/i.test(document.documentType || ""))
    return document;
  return { ...document, folioReview: {
    first: String(document.documentNumber), second: null, reason: "unavailable",
  } };
}

export const FOCUSED_PROMPT = `Relee de forma independiente este comprobante chileno. Si recibes varias imágenes, son distintas orientaciones o mejoras de la MISMA foto: elige la más legible; no cuentes varios documentos. Comprueba uno por uno los dígitos del folio, especialmente 3/8, 0/6 y 1/7. Si no se distingue un dígito, usa null; no completes por contexto. Responde solo JSON: {"providerRut":string|null,"documentNumber":string|null,"folioEvidence":string|null,"typeEvidence":string|null,"operationNumber":string|null,"operationEvidence":string|null}.
providerRut: copia el RUT del emisor tal como está impreso (no el del cliente). Verifica mentalmente el dígito verificador módulo 11; si la lectura no coincide, vuelve a mirar los dígitos. No cambies uno solo para forzar un RUT válido; usa null si no se distingue.
documentNumber: busca el folio de la boleta/factura. Puede verse como «Folio 123», «N° documento 123», «Boleta Electrónica 123», «Bol. Electronica: 001322303900», «Factura Electrónica N° 123» o rótulos equivalentes. Copia TODOS los dígitos impresos, incluidos los ceros iniciales; el número impreso puede superar 10 caracteres por esos ceros. No lo confundas con RUT, fechas, serie, número de operación/transacción, terminal, caja, aprobación o autorización de tarjeta. En vouchers «Válido como Boleta» sin boleta electrónica separada, usa null aquí.
folioEvidence: transcribe literalmente la línea o rótulo que vincula ese número con el documento tributario, o null.
typeEvidence: transcribe literalmente el rótulo del tipo de documento tributario, o null. Si hay una boleta electrónica explícita Y un voucher de pago en la misma foto, prioriza «Boleta Electrónica». Nunca deduzcas «Factura» por haber IVA desglosado.
operationNumber: solo si el papel es un voucher «Válido como Boleta» sin boleta electrónica separada, copia el número rotulado «Comprobante», «Operación» o «Transacción». Prioriza «Comprobante» cuando aparezca; no es un folio de boleta electrónica. Nunca uses el número de aprobación/autorización, terminal o serie. Si no lo puedes distinguir, usa null.
operationEvidence: transcribe literalmente el rótulo y el número elegido, o null.`;
