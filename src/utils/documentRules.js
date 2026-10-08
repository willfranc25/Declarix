import { validateRut, cleanRut, hasRutFormat } from "./rutValidator.js";

// A manual confirmation is bound to this exact RUT, never to later edits.
export function hasRutConfirmation(doc) {
  return hasRutFormat(doc.providerRut) && doc.rutConfirmation?.confirmed === true &&
    doc.rutConfirmation.rut === cleanRut(doc.providerRut);
}

export function normalizeDocumentType(value) {
  if (typeof value !== "string") return null;
  const plain = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!plain) return null;
  if (/comprobante.*pago|voucher|valido como boleta/.test(plain)) return "Comprobante de pago electrónico";
  if (/nota de credito/.test(plain)) return "Nota de Crédito";
  if (/nota de debito/.test(plain)) return "Nota de Débito";
  if (/boleta.*honorario/.test(plain)) return "Boleta de Honorarios";
  if (/factura/.test(plain)) return /exent|no afecta/.test(plain) ? "Factura Exenta" : /electronic/.test(plain) ? "Factura Electrónica" : "Factura";
  if (/boleta/.test(plain)) return /exent|no afecta/.test(plain) ? "Boleta Exenta" : /electronic/.test(plain) ? "Boleta Electrónica" : "Boleta";
  return "Otro";
}

export const AMOUNT_FIELDS = [
  "netAmount",
  "exemptAmount",
  "ivaAmount",
  "specificTax",
  "otherTax",
  "withholdingAmount",
  "totalAmount",
  "totalBoletaServicios",
  "totalBoletaHonorarios",
];
export function civilDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
    ? { year, month, day }
    : null;
}
export function todayChile() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const p = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export const isCreditNote = (doc) =>
  doc.documentType
    ? /nota de cr[eé]dito/i.test(doc.documentType)
    : Number(doc.documentCode) === 61;
export const signedAmount = (doc, field) =>
  (isCreditNote(doc) ? -1 : 1) * Math.abs(Number(doc[field]) || 0);
export const isPaymentVoucher = (doc) => normalizeDocumentType(doc.documentType) === "Comprobante de pago electrónico";
// 0000 is our no-SII-folio marker, never a number inferred from a POS ticket.
export function withVoucherFolio(doc) {
  return isPaymentVoucher(doc) ? { ...doc, documentNumber: "0000", folioReview: null } : doc;
}
export function documentKey(doc) {
  if (!doc.providerRut || !doc.documentNumber || !doc.documentType) return null;
  if (isPaymentVoucher(doc)) {
    // Without an explicit operation, only source/file idempotency can decide duplicates.
    const reference = String(doc.referenceNumber || "").trim();
    if (!reference || !civilDate(doc.date) || !(Number(doc.totalAmount) > 0)) return null;
    return `${cleanRut(doc.providerRut)}|voucher|${reference}|${doc.date}|${Number(doc.totalAmount)}`;
  }
  const types = {
    "Factura Electrónica": "Factura",
    "Boleta Electrónica": "Boleta",
  };
  const type = normalizeDocumentType(doc.documentType);
  return `${cleanRut(doc.providerRut)}|${types[type] || type}|${String(
    doc.documentNumber,
  )
    .trim()
    .replace(/^0+(?=\d)/, "")}`;
}
export function documentErrors(doc, today = todayChile()) {
  const errors = {};
  if (!doc.providerName?.trim()) errors.providerName = "Falta proveedor";
  if (!validateRut(doc.providerRut || "") && !hasRutConfirmation(doc))
    errors.providerRut = doc.providerRut
      ? "El RUT no coincide con su dígito verificador. Revisa la foto o confirma que coincide con el original."
      : "Falta RUT";
  if (isPaymentVoucher(doc)) {
    if (doc.documentNumber !== "0000") errors.documentNumber = "El voucher sin folio SII usa 0000";
  } else if (doc.folioReview)
    errors.documentNumber = "Confirma el folio comparándolo con la foto";
  else if (!String(doc.documentNumber || "").trim())
    errors.documentNumber = "Falta folio";
  if (!civilDate(doc.date)) errors.date = "Fecha inválida o ausente";
  else if (doc.date > today) errors.date = "Fecha futura";
  if (!doc.documentType) errors.documentType = "Falta tipo de documento";
  if (!doc.expenseType?.trim()) errors.expenseType = "Falta tipo de gasto";
  for (const field of AMOUNT_FIELDS) {
    if (
      doc[field] !== null &&
      doc[field] !== undefined &&
      doc[field] !== "" &&
      (!Number.isFinite(Number(doc[field])) || Number(doc[field]) < 0)
    )
      errors[field] = "Monto inválido: ingresa un valor positivo";
  }
  if (!(Number(doc.totalAmount) > 0))
    errors.totalAmount = "Falta un total mayor que cero";
  if (
    /factura|nota de cr[eé]dito|nota de d[eé]bito/i.test(doc.documentType || "")
  ) {
    if (doc.netAmount == null || doc.ivaAmount == null)
      errors.amounts = "Faltan montos por confirmar";
    else {
      const sum =
        [
          "netAmount",
          "exemptAmount",
          "ivaAmount",
          "specificTax",
          "otherTax",
        ].reduce((s, k) => s + (Number(doc[k]) || 0), 0) -
        (Number(doc.withholdingAmount) || 0);
      if (Math.abs(sum - Number(doc.totalAmount)) > 2)
        errors.amounts = "Neto + exento + impuestos − retenciones ≠ Total";
    }
  }
  return errors;
}
export function normalizeDocument(raw) {
  const out = {};
  for (const key of [
    "providerName",
    "providerRut",
    "recipientRut",
    "documentType",
    "documentNumber",
    "date",
    "detail",
    "expenseType",
    "notes",
    "referenceNumber",
    "costCenter",
  ])
    out[key] = typeof raw[key] === "string" ? raw[key].trim() : null;
  out.documentType = normalizeDocumentType(out.documentType);
  for (const key of AMOUNT_FIELDS)
    out[key] =
      raw[key] == null || raw[key] === ""
        ? null
        : Number.isFinite(Number(raw[key]))
          ? Number(raw[key])
          : null;
  out.documentCode = Number(raw.documentCode) || null;
  out.rutConfirmation = hasRutConfirmation(raw) && !validateRut(raw.providerRut)
    ? { ...raw.rutConfirmation, rut: cleanRut(raw.providerRut), confirmed: true } : null;
  out.taxStatus = "pending";
  out.status = "pending";
  return withVoucherFolio(out);
}
