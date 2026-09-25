import { validateRut, cleanRut } from "./rutValidator.js";

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
export function documentKey(doc) {
  if (!doc.providerRut || !doc.documentNumber || !doc.documentType) return null;
  const types = {
    "Factura Electrónica": "Factura",
    "Boleta Electrónica": "Boleta",
  };
  return `${cleanRut(doc.providerRut)}|${types[doc.documentType] || doc.documentType}|${String(
    doc.documentNumber,
  )
    .trim()
    .replace(/^0+(?=\d)/, "")}`;
}
export function documentErrors(doc, today = todayChile()) {
  const errors = {};
  if (!doc.providerName?.trim()) errors.providerName = "Falta proveedor";
  if (!validateRut(doc.providerRut || ""))
    errors.providerRut = doc.providerRut ? "RUT inválido" : "Falta RUT";
  if (!String(doc.documentNumber || "").trim())
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
  for (const key of AMOUNT_FIELDS)
    out[key] =
      raw[key] == null || raw[key] === ""
        ? null
        : Number.isFinite(Number(raw[key]))
          ? Number(raw[key])
          : null;
  out.documentCode = Number(raw.documentCode) || null;
  out.taxStatus = "pending";
  out.status = "pending";
  return out;
}
