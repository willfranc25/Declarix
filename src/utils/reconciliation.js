import { cleanRut } from "./rutValidator";
export function parseCsv(text) {
  text = text.replace(/^\uFEFF/, "");
  const delimiter = text.split(/\r?\n/, 1)[0].includes(";") ? ";" : ",";
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("El CSV contiene comillas sin cerrar.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  return rows;
}
const normalize = (v) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const typeCode = (i) =>
  i.documentCode ||
  {
    Factura: 33,
    "Factura Electrónica": 33,
    "Factura Exenta": 34,
    Boleta: 39,
    "Boleta Electrónica": 39,
    "Boleta Exenta": 41,
    "Nota de Débito": 56,
    "Nota de Crédito": 61,
  }[i.documentType];
const key = (rut, type, folio) =>
  cleanRut(rut) +
  "|" +
  Number(type) +
  "|" +
  String(folio)
    .trim()
    .replace(/^0+(?=\d)/, "");
export function reconcileRCV(text, invoices) {
  const [headers, ...rows] = parseCsv(text);
  if (!headers) throw new Error("El archivo está vacío.");
  const columns = headers.map(normalize);
  const find = (...names) => columns.findIndex((c) => names.includes(c));
  const rut = find("rutproveedor", "rutemisor"),
    type = find("tipodoc", "tipodocumento"),
    folio = find("folio", "nrodocumento"),
    total = find("montototal", "total");
  if ([rut, type, folio, total].includes(-1))
    throw new Error(
      "Faltan columnas: RUT Proveedor, Tipo Doc, Folio y Monto Total.",
    );
  const ours = new Map(
    invoices.map((i) => [key(i.providerRut, typeCode(i), i.documentNumber), i]),
  );
  const seen = new Set(),
    results = [];
  for (const row of rows) {
    const id = key(row[rut] || "", row[type], row[folio]);
    const local = ours.get(id);
    const amount = Number(
      String(row[total] || "")
        .replace(/\./g, "")
        .replace(",", "."),
    );
    if (!Number.isFinite(amount) || !row[rut] || !row[folio])
      throw new Error("Hay filas con RUT, folio o total inválido.");
    const status = seen.has(id)
      ? "duplicado_rcv"
      : !local
        ? "solo_rcv"
        : Math.abs(Math.abs(amount) - Math.abs(Number(local.totalAmount))) > 2
          ? "diferencia"
          : "coincide";
    results.push({
      key: id,
      rut: row[rut],
      folio: row[folio],
      status,
      rcvTotal: amount,
      localTotal: local?.totalAmount,
      invoiceId: local?.id,
    });
    seen.add(id);
  }
  for (const [id, i] of ours)
    if (!seen.has(id))
      results.push({
        key: id,
        rut: i.providerRut,
        folio: i.documentNumber,
        status: "solo_declarix",
        localTotal: i.totalAmount,
        invoiceId: i.id,
      });
  return results;
}
