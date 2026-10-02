import { useEffect, useState } from "react";
import { developerRequest } from "../services/developerFormats";
import DocumentPreview from "../components/DocumentPreview";
import "../styles/developerFormats.css";

const statuses = { new: "Nuevo", needs_review: "Requiere revisión", reviewed: "Revisado", ignored: "Ignorado" };
const fields = { providerName: "Proveedor", providerRut: "RUT", documentType: "Tipo", documentNumber: "Folio", date: "Fecha", netAmount: "Neto", ivaAmount: "IVA", totalAmount: "Total" };
const displayValue = value => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 500) : '—';
function FormatReview({ format, onSaved }) {
  const [notes, setNotes] = useState(format.notes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sampleKey, setSampleKey] = useState("");
  const [sampleVersion, setSampleVersion] = useState(0);
  const [sample, setSample] = useState(null);
  const [sampleError, setSampleError] = useState("");
  useEffect(() => {
    if (!sampleKey) return;
    const abort = new AbortController();
    const [jobId, index] = sampleKey.split(":");
    developerRequest("sample", { jobId, index: Number(index) }, abort.signal)
      .then(value => { if (!abort.signal.aborted) setSample(value); })
      .catch(err => { if (!abort.signal.aborted) setSampleError(err.message); });
    return () => abort.abort();
  }, [sampleKey, sampleVersion]);
  async function save(status) {
    setBusy(true); setError("");
    try { await developerRequest("review", { fingerprint: format.fingerprint, status, notes }); onSaved(); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  return <section className="card format-review">
    <h2>{format.profile.brand} · {format.profile.documentType}</h2>
    <p className="text-muted">{format.profile.layout} · {format.profile.processor} · rótulo: {format.profile.folioLabel}</p>
    <p>Secciones: {format.profile.sections.join(" → ") || "Sin identificar"}</p>
    <p>{format.seen_count} documentos · {format.issue_count} con problemas detectados. Estado: {statuses[format.status]}.</p>
    <label className="form-label" htmlFor="format-notes">Notas privadas para mejorar la extracción</label>
    <textarea id="format-notes" className="form-input" value={notes} onChange={e => setNotes(e.target.value)} maxLength={2000} rows={3} />
    <div className="flex gap-2 flex-wrap">
      <button className="btn btn-primary" disabled={busy} onClick={() => save("reviewed")}>Marcar revisado</button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => save("needs_review")}>Pendiente de mejora</button>
      <button className="btn btn-secondary" disabled={busy} onClick={() => save("ignored")}>Ignorar</button>
    </div>
    {error && <p role="alert">{error}</p>}
    <h3>Ejemplos recientes</h3>
    <p className="text-muted">El original permanece en su almacenamiento privado. Abrirlo queda registrado y el enlace vence en 10 minutos.</p>
    <div className="flex gap-2 flex-wrap">{format.samples.map(s => <button className="btn btn-secondary" key={`${s.job_id}:${s.document_index}`} onClick={() => {
      setSample(null); setSampleError(""); setSampleKey(`${s.job_id}:${s.document_index}`); setSampleVersion(n => n + 1);
    }}>{s.filename} · {s.document_index < 0 ? "Extracción fallida" : `Documento ${s.document_index + 1}`}</button>)}</div>
    {sampleKey && !sample && !sampleError && <p role="status">Cargando original…</p>}
    {sampleError && <p role="alert">{sampleError}</p>}
    {sample && <div className="format-sample">
      <div><h3>Datos y correcciones</h3><p>{sample.issues.join(", ") || "Sin errores automáticos"}</p>
        <table className="data-table"><thead><tr><th>Dato</th><th>Extraído</th><th>Corrección</th></tr></thead><tbody>
          {Object.entries(fields).map(([key, label]) => <tr key={key}><th scope="row">{label}</th><td>{displayValue(sample.document?.[key])}</td><td>{displayValue(sample.review?.[key])}</td></tr>)}
        </tbody></table>
        <button className="btn btn-secondary" onClick={() => { setSample(null); setSampleKey(""); }}>Cerrar ejemplo</button>
      </div>
      <DocumentPreview src={sample.url} mimeType={sample.mimeType} title={sample.filename} />
    </div>}
  </section>;
}

export default function DeveloperFormatsPage() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const abort = new AbortController();
    developerRequest("list", { status, page }, abort.signal)
      .then(data => { if (!abort.signal.aborted) { setResult(data); setError(""); } })
      .catch(err => { if (!abort.signal.aborted) setError(err.message); });
    return () => abort.abort();
  }, [status, page, revision]);
  return <div className="page-container">
    <h1>Formatos de comprobantes</h1>
    <p className="page-subtitle">Panel privado de desarrollo. Los diseños se agrupan por sus características; requieren revisión humana antes de ajustar la extracción.</p>
    <label htmlFor="format-status" className="form-label">Estado</label>
    <select id="format-status" className="form-input" value={status} onChange={e => { setStatus(e.target.value); setPage(1); setResult(null); setSelected(null); }}>
      <option value="">Todos</option>{Object.entries(statuses).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
    </select>
    <button className="btn btn-secondary" onClick={() => { setResult(null); setRevision(n => n + 1); setSelected(null); }}>Actualizar</button>
    {error ? <p role="alert">{error}</p> : !result ? <p role="status">Cargando catálogo privado…</p> : <>
      <p>{result.total} formatos registrados</p>
      {!result.rows.length && <p>Los formatos aparecerán al procesar nuevos documentos.</p>}
      <div className="format-list">{result.rows.map(f => <button className="card format-card" key={f.fingerprint} onClick={() => setSelected(f)}>
        <strong>{f.profile.brand} · {f.profile.documentType}</strong><span>{statuses[f.status]} · {f.seen_count} documentos · {f.issue_count} con problemas</span>
        <span>{f.profile.processor} · {f.profile.layout} · última carga: {new Date(f.last_seen).toLocaleDateString("es-CL")}</span>
      </button>)}</div>
      <div className="flex gap-2"><button className="btn btn-secondary" disabled={page === 1} onClick={() => { setPage(p => p - 1); setResult(null); setSelected(null); }}>Anterior</button>
        <span>Página {page} de {Math.max(1, Math.ceil(result.total / 25))}</span>
        <button className="btn btn-secondary" disabled={page * 25 >= result.total} onClick={() => { setPage(p => p + 1); setResult(null); setSelected(null); }}>Siguiente</button></div>
    </>}
    {selected && !error && <FormatReview key={selected.fingerprint} format={selected} onSaved={() => { setSelected(null); setRevision(r => r + 1); }} />}
  </div>;
}
