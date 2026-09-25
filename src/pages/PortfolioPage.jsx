import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCompany } from "../context/CompanyContext";
import { useAuth } from "../context/AuthContext";
import { supabase } from "../services/supabaseClient";
import { cleanRut, formatRut, validateRut } from "../utils/rutValidator";
import { todayChile } from "../utils/documentRules";
import "../styles/workspace.css";
export default function PortfolioPage() {
  const { companies, loading, error, refresh, selectCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [account, setAccount] = useState(null);
  const [summary, setSummary] = useState([]);
  useEffect(() => {
    let current = true;
    Promise.all([
      supabase
        .from("accountant_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase.rpc("portfolio_summary", { p_period: todayChile().slice(0, 7) }),
    ]).then(([a, s]) => {
      if (current) {
        setAccount(a.data);
        setSummary(s.data || []);
      }
    });
    return () => {
      current = false;
    };
  }, [user.id, companies]);
  const save = async (e) => {
    e.preventDefault();
    setMessage("");
    if (!form.name.trim() || !validateRut(form.rut)) {
      setMessage("Ingresa la razón social y un RUT válido.");
      return;
    }
    setBusy(true);
    const payload = { name: form.name.trim(), rut: cleanRut(form.rut) };
    const { error: err } = form.id
      ? await supabase.from("organizations").update(payload).eq("id", form.id)
      : await supabase
          .from("organizations")
          .insert({
            ...payload,
            accountant_id: user.id,
            created_by: user.id,
            plan_id: "free",
          });
    setBusy(false);
    if (err) {
      setMessage(
        err.code === "23505" ? "Ese RUT ya está en tu cartera." : err.message,
      );
      return;
    }
    setForm(null);
    await refresh();
  };
  const archive = async (c) => {
    if (
      !window.confirm(
        (c.archived ? "Reactivar " : "Archivar ") +
          c.name +
          "? Sus comprobantes se conservarán.",
      )
    )
      return;
    const { error: err } = await supabase
      .from("organizations")
      .update({ archived: !c.archived })
      .eq("id", c.id);
    if (err) setMessage(err.message);
    else await refresh();
  };
  const visible = companies.filter((c) =>
    (c.name + " " + (c.rut || "")).toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <div className="workspace-page">
      <div className="page-header">
        <div>
          <p className="workspace-eyebrow">TU ESPACIO CONTABLE</p>
          <h1 className="page-title">Mi cartera de empresas</h1>
          <p className="page-subtitle">
            Cada empresa tiene sus documentos, revisiones y cierres. Tú
            controlas el conjunto.
          </p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setForm({ name: "", rut: "" });
            setMessage("");
          }}
        >
          Agregar empresa
        </button>
      </div>
      <div className="workspace-metrics">
        <div className="card">
          <span>Empresas activas</span>
          <strong>{companies.filter((c) => !c.archived).length}</strong>
        </div>
        <div className="card">
          <span>Por revisar este mes</span>
          <strong>{summary.reduce((n, c) => n + Number(c.pending), 0)}</strong>
        </div>
        <div className="card">
          <span>Créditos disponibles</span>
          <strong>{account ? account.credits - account.reserved : "—"}</strong>
          <Link to="/usage">Ver consumo y saldo</Link>
        </div>
      </div>
      {(message || error) && (
        <p className="alert alert-danger" role="alert">
          {message || error}
        </p>
      )}
      {form && (
        <form onSubmit={save} className="card company-form">
          <h2>{form.id ? "Editar empresa" : "Nueva empresa"}</h2>
          <label>
            Razón social
            <input
              autoFocus
              className="form-input"
              maxLength={160}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label>
            RUT de la empresa
            <input
              className="form-input"
              required
              placeholder="76.123.456-7"
              value={form.rut}
              onChange={(e) => setForm({ ...form, rut: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? "Guardando…" : "Guardar empresa"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setForm(null)}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
      <label className="company-search">
        Buscar empresa
        <input
          className="form-input"
          type="search"
          value={search}
          placeholder="Nombre o RUT"
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      {loading ? (
        <p role="status">Cargando cartera…</p>
      ) : companies.length === 0 ? (
        <div className="card portfolio-empty">
          <h2>Comienza con tu primera empresa</h2>
          <p>
            Agrega su razón social y RUT. Después podrás cargar sus documentos y
            preparar la rendición mensual.
          </p>
          <button
            className="btn btn-primary"
            onClick={() => setForm({ name: "", rut: "" })}
          >
            Agregar mi primera empresa
          </button>
        </div>
      ) : (
        <div className="company-grid">
          {visible.map((c) => {
            const s = summary.find((r) => r.company_id === c.id);
            return (
              <article
                className={
                  "card company-card " + (c.archived ? "company-archived" : "")
                }
                key={c.id}
              >
                <div className="flex justify-between">
                  <span className="company-monogram" aria-hidden="true">
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="badge">
                    {c.archived
                      ? "Archivada"
                      : s?.closed
                        ? "Mes cerrado"
                        : "En preparación"}
                  </span>
                </div>
                <h2>{c.name}</h2>
                <p className="text-muted">
                  {c.rut ? formatRut(c.rut) : "Completa el RUT de esta empresa"}
                </p>
                <p>
                  <strong>{s?.pending || 0}</strong> por revisar ·{" "}
                  <strong>{s?.total || 0}</strong> comprobantes este mes
                </p>
                <div className="flex gap-2 flex-wrap">
                  <button
                    disabled={c.archived}
                    className="btn btn-primary"
                    onClick={() => {
                      selectCompany(c);
                      navigate("/dashboard");
                    }}
                  >
                    Abrir empresa
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setForm(c)}
                  >
                    Editar
                  </button>
                  <button className="btn btn-ghost" onClick={() => archive(c)}>
                    {c.archived ? "Reactivar" : "Archivar"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
