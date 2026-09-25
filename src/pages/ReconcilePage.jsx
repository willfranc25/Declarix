import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useInvoiceStore from "../store/invoiceStore";
import { reconcileRCV } from "../utils/reconciliation";
import { previousMonthValue } from "../utils/reportPeriod";
import { formatCurrency } from "../utils/formatters";
const LABELS = {
  coincide: "Coincide",
  diferencia: "Diferencia de monto",
  solo_rcv: "Falta en Declarix",
  solo_declarix: "No está en este RCV",
  duplicado_rcv: "Duplicado en el CSV",
};
export default function ReconcilePage() {
  const { invoices, loadInvoices } = useInvoiceStore();
  const [month, setMonth] = useState(previousMonthValue()),
    [results, setResults] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);
  return (
    <div className="workspace-page">
      <div>
        <h1 className="page-title">Conciliación con RCV</h1>
        <p className="page-subtitle">
          Compara el CSV del Registro de Compras y Ventas con los documentos del
          período. La comparación no modifica tus comprobantes.
        </p>
      </div>
      <div className="card company-form">
        <label>
          Período del archivo
          <input
            className="form-input"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setResults(null);
            }}
          />
        </label>
        <label>
          CSV de compras del SII
          <input
            type="file"
            accept=".csv"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 10 * 1024 * 1024)
                  throw new Error("El CSV supera 10 MB.");
                setResults(
                  reconcileRCV(
                    await file.text(),
                    invoices.filter((i) => i.date?.slice(0, 7) === month),
                  ),
                );
                setError("");
              } catch (err) {
                setError(err.message);
              }
            }}
          />
        </label>
        <p>
          Verifica que el archivo corresponda a la empresa seleccionada y al
          mismo mes. “No está en este RCV” requiere revisión; no demuestra que
          el gasto sea inválido.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {results && (
        <>
          <div className="card">
            {Object.entries(LABELS).map(([k, v]) => (
              <p key={k}>
                <strong>{results.filter((r) => r.status === k).length}</strong>{" "}
                · {v}
              </p>
            ))}
          </div>
          <div className="card" style={{ overflowX: "auto" }}>
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Resultado</th>
                  <th>RUT / folio</th>
                  <th>RCV</th>
                  <th>Declarix</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i}>
                    <td>{LABELS[r.status]}</td>
                    <td>
                      {r.invoiceId ? (
                        <Link to={"/invoices/" + r.invoiceId}>
                          {r.rut} · {r.folio}
                        </Link>
                      ) : (
                        r.rut + " · " + r.folio
                      )}
                    </td>
                    <td>
                      {r.rcvTotal == null ? "—" : formatCurrency(r.rcvTotal)}
                    </td>
                    <td>
                      {r.localTotal == null
                        ? "—"
                        : formatCurrency(r.localTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
