import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { normalizeDocument } from "../src/utils/documentRules.js";
export const MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/xml",
  "text/xml",
];
const invalid = () => {
  throw new Error("INVALID_FILE");
};
const list = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export function parseDTE(xml) {
  if (
    xml.length > 4_000_000 ||
    /<!DOCTYPE|<!ENTITY/i.test(xml) ||
    XMLValidator.validate(xml) !== true
  )
    invalid();
  const parsed = new XMLParser({
    ignoreAttributes: true,
    removeNSPrefix: true,
    parseTagValue: false,
    processEntities: false,
  }).parse(xml);
  const dtes = list(
    parsed.EnvioDTE?.SetDTE?.DTE ||
      parsed.EnvioBOLETA?.SetDTE?.DTE ||
      parsed.DTE,
  );
  if (!dtes.length || dtes.length > 100) invalid();
  const types = {
    33: "Factura Electrónica",
    34: "Factura Exenta",
    39: "Boleta Electrónica",
    41: "Boleta Exenta",
    56: "Nota de Débito",
    61: "Nota de Crédito",
  };
  return dtes.map((dte) => {
    const d = dte.Documento,
      h = d?.Encabezado,
      t = h?.Totales;
    if (!h?.IdDoc || !t || !types[h.IdDoc.TipoDTE]) invalid();
    const code = Number(h.IdDoc.TipoDTE);
    const taxes = list(t.ImptoReten);
    return normalizeDocument({
      providerName: h.Emisor?.RznSoc || h.Emisor?.RznSocEmisor,
      providerRut: h.Emisor?.RUTEmisor,
      recipientRut: h.Receptor?.RUTRecep,
      documentType: types[code],
      documentCode: code,
      documentNumber: h.IdDoc.Folio,
      date: h.IdDoc.FchEmis,
      detail: list(d.Detalle)
        .map((x) => x.NmbItem)
        .filter(Boolean)
        .join("; ")
        .slice(0, 2000),
      expenseType: null,
      referenceNumber: list(d.Referencia)[0]?.FolioRef || null,
      netAmount: Number(t.MntNeto || 0),
      exemptAmount: Number(t.MntExe || 0),
      ivaAmount: Number(t.IVA || 0),
      specificTax: 0,
      otherTax: taxes.length ? null : 0,
      withholdingAmount: taxes.length ? null : 0,
      totalAmount: Number(t.MntTotal),
      totalBoletaServicios: [39, 41].includes(code) ? Number(t.MntTotal) : 0,
      totalBoletaHonorarios: 0,
      notes: taxes.length
        ? "XML con impuestos adicionales o retenciones: confirmar sus montos con el original. La importación no valida la firma electrónica."
        : null,
    });
  });
}
export async function inspectDocument(bytes, mime) {
  if (
    !bytes.length ||
    bytes.length > 20 * 1024 * 1024 ||
    !MIME_TYPES.includes(mime)
  )
    invalid();
  let pages = 1;
  if (mime === "application/pdf") {
    if (bytes.subarray(0, 5).toString() !== "%PDF-") invalid();
    try {
      pages = (await PDFDocument.load(bytes)).getPageCount();
    } catch {
      invalid();
    }
    if (pages < 1 || pages > 20) invalid();
  } else if (/xml$/.test(mime)) {
    pages = parseDTE(bytes.toString("utf8")).length;
  } else if (
    mime === "image/jpeg" &&
    !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
  )
    invalid();
  else if (
    mime === "image/png" &&
    bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
  )
    invalid();
  else if (
    mime === "image/webp" &&
    !(
      bytes.subarray(0, 4).toString() === "RIFF" &&
      bytes.subarray(8, 12).toString() === "WEBP"
    )
  )
    invalid();
  return { pages, hash: createHash("sha256").update(bytes).digest("hex") };
}
