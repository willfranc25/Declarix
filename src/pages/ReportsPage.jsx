import { useEffect, useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";
import { supabase } from "../services/supabaseClient";
import { getStorageProvider } from "../services/storage/StorageProvider";
import useInvoiceStore from "../store/invoiceStore";
import {
  exportRendicionPackage,
  exportToCSV,
  exportToExcel,
  downloadFile,
} from "../services/exportService";
import {
  documentErrors,
  signedAmount,
  todayChile,
} from "../utils/documentRules";
import {
  formatCurrency,
  formatDate,
  getStatusLabel,
} from "../utils/formatters";
import { previousMonthValue } from "../utils/reportPeriod";
import { getWorkspaceGeneration } from "../services/organizationService";
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
const LABELS = {
  providerName: "Proveedor",
  providerRut: "RUT",
  documentType: "Tipo",
  documentNumber: "Folio",
  date: "Fecha",
  detail: "Detalle",
  expenseType: "Categoría",
  netAmount: "Neto",
  totalBoletaServicios: "Boletas",
  totalBoletaHonorarios: "Honorarios",
  specificTax: "Impuesto específico",
};
const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};
export default function ReportsPage() {
  const { activeCompany } = useCompany();
  const { invoices, loadInvoices, updateInvoice } = useInvoiceStore();
  const [month, setMonth] = useState(previousMonthValue());
  const [periodMode, setPeriodMode] = useState("month");
  const [endMonth, setEndMonth] = useState(previousMonthValue());
  const [year, setYear] = useState(todayChile().slice(0, 4));
  const periodKey =
    periodMode === "year"
      ? year
      : periodMode === "range"
        ? month + "_" + endMonth
        : month;
  const initialSelection = useRef("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState(new Set());
  const [template, setTemplate] = useState(null);
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);
  const [showConfig, setShowConfig] = useState(false);
  const [format, setFormat] = useState("rendicion");
  const [originals, setOriginals] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [closed, setClosed] = useState(false);
  const [history, setHistory] = useState([]);
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);
  useEffect(() => {
    let live = true;
    const storage = getStorageProvider();
    Promise.all([
      storage.getSetting("rendicion_template"),
      storage.getSetting("rendicion_mapping"),
    ])
      .then(([t, m]) => {
        if (!live) return;
        if (t)
          setTemplate({
            ...t,
            buffer: Uint8Array.from(atob(t.base64), (c) => c.charCodeAt(0))
              .buffer,
          });
        else
          fetch("/template.xlsm")
            .then((r) => {
              if (!r.ok) throw new Error();
              return r.arrayBuffer();
            })
            .then((buffer) => {
              if (live) setTemplate({ name: "Plantilla inicial", buffer });
            })
            .catch(() => {
              if (live)
                setMessage(
                  "Carga la plantilla de esta empresa para generar la rendición.",
                );
            });
        if (m) setMapping(m);
      })
      .catch((err) => {
        if (live) setMessage(err.message);
      });
    return () => {
      live = false;
    };
  }, [activeCompany.id]);
  const periodRequest = useRef(0);
  const refreshPeriod = async () => {
    const request = ++periodRequest.current;
    const [c, h] = await Promise.all([
      supabase
        .from("period_closures")
        .select("period")
        .eq("organization_id", activeCompany.id)
        .eq("period", month)
        .maybeSingle(),
      supabase
        .from("export_batches")
        .select("id,filename,created_at,totals")
        .eq("organization_id", activeCompany.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    if (request === periodRequest.current) {
      setClosed(Boolean(unwrap(c)));
      setHistory(unwrap(h));
    }
  };
  useEffect(() => {
    refreshPeriod().catch((err) => setMessage(err.message));
  }, [month, activeCompany.id]);
  const rows = useMemo(
    () =>
      invoices.filter((i) => {
        const date = i.date?.slice(0, 7);
        const inPeriod =
          periodMode === "year"
            ? i.date?.slice(0, 4) === year
            : periodMode === "range"
              ? date >= [month, endMonth].sort()[0] &&
                date <= [month, endMonth].sort()[1]
              : date === month;
        return inPeriod && (status === "all" || i.taxStatus === status);
      }),
    [invoices, month, endMonth, year, periodMode, status],
  );
  useEffect(() => {
    const key = activeCompany.id + "|" + periodKey + "|" + status;
    if (rows.length && initialSelection.current !== key) {
      setSelected(new Set(rows.map((r) => r.id)));
      initialSelection.current = key;
    }
  }, [rows, activeCompany.id, periodKey, status]);
  const chosen = rows.filter((i) => selected.has(i.id));
  const issues = chosen.filter(
    (i) => Object.keys(documentErrors(i)).length || i.taxStatus === "pending",
  );
  const totals = ["netAmount", "ivaAmount", "totalAmount"].map((field) =>
    chosen.reduce((n, i) => n + signedAmount(i, field), 0),
  );
  const uploadTemplate = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      if (!/\.xls[mx]$/i.test(file.name) || file.size > 2 * 1024 * 1024)
        throw new Error("Usa una plantilla XLSX/XLSM de hasta 2 MB.");
      const buffer = await file.arrayBuffer();
      const { inspectTemplate } = await import("../services/templateExport");
      await inspectTemplate(buffer);
      let binary = "";
      for (const byte of new Uint8Array(buffer))
        binary += String.fromCharCode(byte);
      const saved = {
        name: file.name,
        base64: btoa(binary),
        updatedAt: new Date().toISOString(),
      };
      await getStorageProvider().saveSetting("rendicion_template", saved);
      setTemplate({ ...saved, buffer });
      setMessage("Plantilla guardada para " + activeCompany.name + ".");
    } catch (err) {
      setMessage(err.message);
    }
  };
  const exportSelection = async () => {
    const generation = getWorkspaceGeneration();
    if (!chosen.length) return;
    if (issues.length) {
      setMessage(
        "Revisa los " +
          issues.length +
          " comprobantes pendientes o con campos incompletos antes de exportar.",
      );
      return;
    }
    if (!activeCompany.rut) {
      setMessage(
        "Completa el RUT de la empresa en Mi cartera antes de exportar.",
      );
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      let content,
        extension,
        mime,
        hash = null;
      if (format === "rendicion") {
        if (!template) throw new Error("Carga una plantilla de rendición.");
        const storage = getStorageProvider();
        const result = await exportRendicionPackage(
          chosen,
          template.buffer,
          {
            nombre: activeCompany.name,
            rut: activeCompany.rut,
            fechaRendicion: formatDate(todayChile()),
          },
          mapping,
          originals ? { getOriginal: (id) => storage.getImage(id) } : {},
        );
        content = result.buffer;
        hash = result.templateHash;
        extension = "zip";
        mime = "application/zip";
      } else if (format === "excel") {
        content = await exportToExcel(chosen, {
          includeMonthlySheet: true,
          includeCategorySheet: true,
        });
        extension = "xlsx";
        mime =
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
      } else {
        content = "\uFEFF" + exportToCSV(chosen);
        extension = "csv";
        mime = "text/csv;charset=utf-8";
      }
      const filename =
        "Rendicion-" + activeCompany.rut + "-" + periodKey + "." + extension;
      if (generation !== getWorkspaceGeneration())
        throw new Error("La empresa cambió. Genera la exportación nuevamente.");
      unwrap(
        await supabase.rpc("record_export", {
          p_company: activeCompany.id,
          p_ids: chosen.map((i) => i.id),
          p_filename: filename,
          p_template_hash: hash,
          p_versions: Object.fromEntries(
            chosen.map((i) => [i.id, i.updatedAt]),
          ),
        }),
      );
      downloadFile(content, filename, mime);
      await loadInvoices();
      await refreshPeriod();
      setMessage(
        chosen.length +
          " comprobantes exportados. La exportación queda registrada; declarar impuestos es un paso separado.",
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  const reviewSelection = async () => {
    setBusy(true);
    setMessage("");
    try {
      for (const i of chosen) {
        const errors = documentErrors(i);
        if (Object.keys(errors).length)
          throw new Error(
            "Folio " +
              i.documentNumber +
              ": " +
              Object.values(errors).join(" · "),
          );
      }
      for (const i of chosen.filter((i) => i.taxStatus === "pending"))
        await updateInvoice(i.id, { taxStatus: "reviewed" });
      setMessage("Revisión registrada.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  const closePeriod = async () => {
    if (
      !window.confirm(
        closed
          ? "¿Reabrir el período para permitir cambios?"
          : "¿Cerrar el período? Se bloquearán cambios en sus comprobantes hasta reabrirlo.",
      )
    )
      return;
    try {
      unwrap(
        await (closed
          ? supabase
              .from("period_closures")
              .delete()
              .eq("organization_id", activeCompany.id)
              .eq("period", month)
          : supabase
              .from("period_closures")
              .insert({ organization_id: activeCompany.id, period: month })),
      );
      await refreshPeriod();
    } catch (err) {
      setMessage(err.message);
    }
  };
  return (
    <div className="workspace-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Preparar rendición</h1>
          <p className="page-subtitle">
            {activeCompany.name} · Revisa, exporta y cierra cada período.
          </p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => setShowConfig((v) => !v)}
        >
          Configurar plantilla
        </button>
      </div>
      {message && (
        <div className="alert alert-info" role="status">
          {message}
        </div>
      )}
      <div className="card flex gap-3 flex-wrap items-center">
        <label>
          Vista{" "}
          <select
            className="form-select"
            value={periodMode}
            onChange={(e) => setPeriodMode(e.target.value)}
          >
            <option value="month">Mes</option>
            <option value="range">Rango de meses</option>
            <option value="year">Año completo</option>
          </select>
        </label>
        {periodMode === "year" ? (
          <label>
            Año
            <input
              className="form-input"
              type="number"
              min="2000"
              max="2100"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
          </label>
        ) : (
          <label>
            Período{" "}
            <input
              aria-label="Período"
              type="month"
              className="form-input"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
        )}
        {periodMode === "range" && (
          <label>
            Hasta
            <input
              type="month"
              className="form-input"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </label>
        )}
        <label>
          Estado{" "}
          <select
            className="form-select"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos</option>
            {["pending", "reviewed", "exported", "declared"].map((s) => (
              <option key={s} value={s}>
                {getStatusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <span className="badge">
          {periodMode !== "month"
            ? "Cierre por mes"
            : closed
              ? "Período cerrado"
              : "Período abierto"}
        </span>
        <button
          className="btn btn-secondary"
          disabled={periodMode !== "month"}
          onClick={closePeriod}
        >
          {closed ? "Reabrir período" : "Cerrar período"}
        </button>
        <Link to="/reconcile">Conciliar con RCV</Link>
      </div>
      {showConfig && (
        <div className="card company-form">
          <h2>Plantilla de {activeCompany.name}</h2>
          <p>
            25 comprobantes por archivo. Los lotes mayores se dividen en tantos
            archivos como haga falta dentro del ZIP. Se conservan los
            componentes de la plantilla.
          </p>
          <p>Plantilla actual: {template?.name || "Sin plantilla"}</p>
          <input
            aria-label="Cargar plantilla"
            type="file"
            accept=".xlsx,.xlsm"
            onChange={uploadTemplate}
          />
          <p>
            Datos en filas 21–45; columnas L, M y N reservadas para fórmulas.
          </p>
          <div className="company-grid">
            {Object.keys(DEFAULT_MAPPING).map((field) => (
              <label key={field}>
                {LABELS[field]}
                <input
                  className="form-input"
                  maxLength={1}
                  value={mapping[field] || ""}
                  onChange={(e) =>
                    setMapping({
                      ...mapping,
                      [field]: e.target.value.toUpperCase(),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              try {
                await getStorageProvider().saveSetting(
                  "rendicion_mapping",
                  mapping,
                );
                setMessage("Mapeo guardado.");
              } catch (err) {
                setMessage(err.message);
              }
            }}
          >
            Guardar mapeo
          </button>
        </div>
      )}
      <div className="workspace-metrics">
        {[
          "Neto seleccionado",
          "IVA documentado",
          "Total con notas de crédito",
        ].map((label, i) => (
          <div className="card" key={label}>
            <span>{label}</span>
            <strong>{formatCurrency(totals[i])}</strong>
          </div>
        ))}
      </div>
      <p className="text-muted">
        El IVA documentado requiere revisión de su tratamiento tributario.
        Exportar no marca una declaración ante el SII.
      </p>
      <div className="card flex gap-3 flex-wrap items-center">
        <strong>
          {chosen.length} de {rows.length} seleccionados
        </strong>
        <button
          className="btn btn-secondary"
          disabled={!chosen.length || busy || closed}
          onClick={reviewSelection}
        >
          Confirmar revisión
        </button>
        <select
          aria-label="Formato de exportación"
          className="form-select"
          style={{ width: "auto" }}
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        >
          <option value="rendicion">Expediente de rendición (ZIP)</option>
          <option value="excel">Excel completo</option>
          <option value="csv">CSV</option>
        </select>
        {format === "rendicion" && (
          <label>
            <input
              type="checkbox"
              checked={originals}
              onChange={(e) => setOriginals(e.target.checked)}
            />{" "}
            Incluir originales
          </label>
        )}
        <button
          className="btn btn-primary"
          disabled={!chosen.length || busy}
          onClick={exportSelection}
        >
          {busy ? "Preparando…" : "Exportar selección"}
        </button>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table className="workspace-table">
          <thead>
            <tr>
              <th>
                <input
                  aria-label="Seleccionar todos"
                  type="checkbox"
                  checked={rows.length > 0 && chosen.length === rows.length}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? new Set(rows.map((i) => i.id))
                        : new Set(),
                    )
                  }
                />
              </th>
              <th>Proveedor / folio</th>
              <th>Fecha</th>
              <th>Estado</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>
                  <input
                    aria-label={"Seleccionar " + i.documentNumber}
                    type="checkbox"
                    checked={selected.has(i.id)}
                    onChange={(e) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(i.id);
                        else next.delete(i.id);
                        return next;
                      })
                    }
                  />
                </td>
                <td>
                  <Link to={"/invoices/" + i.id}>
                    {i.providerName} · {i.documentNumber}
                  </Link>
                  {Object.keys(documentErrors(i)).length > 0 && (
                    <small style={{ display: "block" }}>
                      Datos por completar
                    </small>
                  )}
                </td>
                <td>{formatDate(i.date)}</td>
                <td>{getStatusLabel(i.taxStatus)}</td>
                <td>{formatCurrency(signedAmount(i, "totalAmount"))}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && (
          <p>
            No hay comprobantes en este período.{" "}
            <Link to="/upload">Cargar documentos</Link>
          </p>
        )}
      </div>
      <details className="card">
        <summary>Historial de exportaciones</summary>
        <ul className="usage-list">
          {history.map((h) => (
            <li key={h.id}>
              {h.filename} · {h.totals.count} comprobantes ·{" "}
              {new Date(h.created_at).toLocaleString("es-CL")}
              <br />
              <small>Registro {h.id}</small>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
