import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { AMOUNT_FIELDS, signedAmount } from "../utils/documentRules";
import { formatDate } from "../utils/formatters";
const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const DEFAULT_MAPPING = {
  providerName: "A",
  providerRut: "B",
  documentType: "C",
  documentNumber: "D",
  date: "E",
  detail: "F",
  expenseType: "G",
  netAmount: "H",
  totalBoletaServicios: "I",
  totalBoletaHonorarios: "J",
  specificTax: "K",
};
const xml = (text) =>
  new DOMParser({
    onError: (level, message) => {
      if (level !== "warning")
        throw new Error("XML de plantilla inválido: " + message);
    },
  }).parseFromString(text, "text/xml");
const children = (node, name) =>
  Array.from(node.getElementsByTagNameNS(NS, name));
export async function inspectTemplate(buffer) {
  if (buffer.byteLength > 20 * 1024 * 1024)
    throw new Error("La plantilla supera 20 MB.");
  const zip = await JSZip.loadAsync(buffer);
  const workbook = xml(
    (await zip.file("xl/workbook.xml")?.async("string")) || "",
  );
  const rels = xml(
    (await zip.file("xl/_rels/workbook.xml.rels")?.async("string")) || "",
  );
  const sheets = children(workbook, "sheet");
  const sheet =
    sheets.find((s) => s.getAttribute("name").toLowerCase() === "base") ||
    sheets[1] ||
    sheets[0];
  if (!sheet) throw new Error("La plantilla no tiene hojas.");
  const id = sheet.getAttributeNS(REL, "id");
  const relationship = Array.from(
    rels.getElementsByTagName("Relationship"),
  ).find((r) => r.getAttribute("Id") === id);
  const target = relationship?.getAttribute("Target") || "";
  const path = target.startsWith("/")
    ? target.slice(1)
    : "xl/" + target.replace(/^\.\//, "");
  if (!zip.file(path) || target.includes(".."))
    throw new Error("Hoja de plantilla inválida.");
  const contentTypes = await zip.file("[Content_Types].xml").async("string");
  return {
    zip,
    workbook,
    path,
    extension: contentTypes.includes("macroEnabled") ? "xlsm" : "xlsx",
    sheetName: sheet.getAttribute("name"),
  };
}
export async function fillTemplate(
  invoices,
  buffer,
  header = {},
  mapping = DEFAULT_MAPPING,
) {
  if (invoices.length > 25)
    throw new Error(
      "La plantilla admite 25 filas. Usa el paquete de rendición para exportar todas.",
    );
  mapping = mapping || DEFAULT_MAPPING;
  const columns = Object.values(mapping)
    .filter(Boolean)
    .map((c) => String(c).toUpperCase());
  if (
    columns.some((c) => !/^([A-K])$/.test(c)) ||
    new Set(columns).size !== columns.length
  )
    throw new Error(
      "Usa columnas únicas entre A y K; L, M y N conservan sus fórmulas.",
    );
  const template = await inspectTemplate(buffer);
  const sheet = xml(await template.zip.file(template.path).async("string"));
  const sheetData = children(sheet, "sheetData")[0];
  if (!sheetData) throw new Error("La plantilla no tiene un área de datos.");
  function write(address, value) {
    const rowNumber = Number(address.match(/\d+$/)[0]);
    let row = children(sheetData, "row").find(
      (r) => Number(r.getAttribute("r")) === rowNumber,
    );
    if (!row) {
      row = sheet.createElementNS(NS, "row");
      row.setAttribute("r", String(rowNumber));
      const next = children(sheetData, "row").find(
        (r) => Number(r.getAttribute("r")) > rowNumber,
      );
      sheetData.insertBefore(row, next || null);
    }
    let cell = children(row, "c").find((c) => c.getAttribute("r") === address);
    if (!cell) {
      cell = sheet.createElementNS(NS, "c");
      cell.setAttribute("r", address);
      const col = address.replace(/\d/g, "");
      const next = children(row, "c").find(
        (c) =>
          c.getAttribute("r").replace(/\d/g, "").localeCompare(col, "en") > 0,
      );
      row.insertBefore(cell, next || null);
    }
    if (children(cell, "f").length)
      throw new Error(
        "El mapeo intentó sobrescribir una fórmula en " + address + ".",
      );
    while (cell.firstChild) cell.removeChild(cell.firstChild);
    cell.removeAttribute("t");
    if (value == null || value === "") return;
    if (typeof value === "number") {
      const v = sheet.createElementNS(NS, "v");
      v.appendChild(sheet.createTextNode(String(value)));
      cell.appendChild(v);
    } else {
      cell.setAttribute("t", "inlineStr");
      const is = sheet.createElementNS(NS, "is"),
        t = sheet.createElementNS(NS, "t");
      t.setAttribute("xml:space", "preserve");
      t.appendChild(sheet.createTextNode(String(value)));
      is.appendChild(t);
      cell.appendChild(is);
    }
  }
  for (const [key, address] of Object.entries({
    fechaRendicion: "B12",
    nombre: "B13",
    rut: "B14",
  }))
    if (header[key]) write(address, header[key]);
  for (let i = 0; i < 25; i++)
    for (const [field, col] of Object.entries(mapping)) {
      if (!col) continue;
      const doc = invoices[i];
      const value = !doc
        ? null
        : AMOUNT_FIELDS.includes(field)
          ? signedAmount(doc, field)
          : field === "date"
            ? formatDate(doc.date)
            : doc[field] || "";
      write(String(col).toUpperCase() + (21 + i), value);
    }
  // Request recalculation; preserve formula expressions and every other ZIP part.
  for (const cell of children(sheet, "c"))
    if (children(cell, "f").length)
      for (const v of children(cell, "v")) cell.removeChild(v);
  let calc = children(template.workbook, "calcPr")[0];
  if (!calc) {
    calc = template.workbook.createElementNS(NS, "calcPr");
    template.workbook.documentElement.appendChild(calc);
  }
  calc.setAttribute("fullCalcOnLoad", "1");
  calc.setAttribute("forceFullCalc", "1");
  calc.setAttribute("calcMode", "auto");
  const serializer = new XMLSerializer();
  template.zip.file(template.path, serializer.serializeToString(sheet));
  template.zip.file(
    "xl/workbook.xml",
    serializer.serializeToString(template.workbook),
  );
  return template.zip.generateAsync({ type: "arraybuffer" });
}
export async function exportRendicionPackage(
  invoices,
  buffer,
  header,
  mapping,
  { getOriginal } = {},
) {
  if (!invoices.length) throw new Error("Selecciona comprobantes.");
  const { extension, sheetName } = await inspectTemplate(buffer);
  const zip = new JSZip(),
    parts = [];
  const hash = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  for (let offset = 0; offset < invoices.length; offset += 25) {
    const rows = invoices.slice(offset, offset + 25),
      filename =
        "Rendicion-" +
        String(parts.length + 1).padStart(3, "0") +
        "." +
        extension;
    zip.file(filename, await fillTemplate(rows, buffer, header, mapping));
    parts.push({ filename, invoiceIds: rows.map((r) => r.id) });
  }
  let originalBytes = 0;
  const originals = new Map();
  if (getOriginal)
    for (const invoice of invoices) {
      const key = invoice.source_job_id || invoice.id;
      if (originals.has(key)) continue;
      const blob = await getOriginal(invoice.id);
      if (!blob)
        throw new Error(
          "Falta el original del comprobante " +
            invoice.documentNumber +
            ". No se generó un expediente incompleto.",
        );
      originalBytes += blob.size;
      if (originalBytes > 200 * 1024 * 1024)
        throw new Error(
          "Los originales superan 200 MB. Exporta el período en selecciones más pequeñas.",
        );
      const ext =
        blob.type === "application/pdf"
          ? "pdf"
          : /xml/.test(blob.type)
            ? "xml"
            : blob.type === "image/png"
              ? "png"
              : blob.type === "image/webp"
                ? "webp"
                : "jpg";
      const filename = "originales/" + key + "." + ext;
      zip.file(filename, await blob.arrayBuffer());
      originals.set(key, filename);
    }
  zip.file(
    "indice.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        templateSha256: hash,
        sheetName,
        company: header,
        parts,
        invoices: invoices.map((i) => ({
          ...i,
          original: originals.get(i.source_job_id || i.id) || null,
        })),
      },
      null,
      2,
    ),
  );
  const { exportToExcel } = await import("./exportService");
  zip.file(
    "Comprobantes-completos.xlsx",
    await exportToExcel(invoices, {
      includeMonthlySheet: true,
      includeCategorySheet: true,
    }),
  );
  zip.file(
    "LEEME.txt",
    "Comprobantes-completos.xlsx contiene los montos registrados, incluyendo exentos, otros impuestos y retenciones. Las rendiciones conservan las fórmulas de tu plantilla: comprueba que representen estos impuestos antes de utilizarlas. No equivalen a una declaración ante el SII.",
  );
  return {
    buffer: await zip.generateAsync({ type: "arraybuffer" }),
    templateHash: hash,
    count: invoices.length,
    parts: parts.length,
  };
}
