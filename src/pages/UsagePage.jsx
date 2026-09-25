import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";
import { useAuth } from "../context/AuthContext";
import { useCompany } from "../context/CompanyContext";
export default function UsagePage() {
  const { user } = useAuth(),
    { companies } = useCompany();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      supabase
        .from("accountant_accounts")
        .select("*")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("credit_ledger")
        .select("*,extraction_jobs(organization_id,filename)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]).then(([a, l]) => {
      if (!live) return;
      if (a.error || l.error) setError("No se pudo cargar el consumo.");
      else setData({ account: a.data, ledger: l.data });
    });
    return () => {
      live = false;
    };
  }, [user.id]);
  return (
    <div className="workspace-page">
      <div>
        <h1 className="page-title">Saldo y consumo</h1>
        <p className="page-subtitle">
          Tu saldo se comparte entre todas las empresas de tu cartera.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div className="workspace-metrics">
            <div className="card">
              <span>Créditos disponibles</span>
              <strong>{data.account.credits - data.account.reserved}</strong>
            </div>
            <div className="card">
              <span>Reservados en procesamiento</span>
              <strong>{data.account.reserved}</strong>
            </div>
            <div className="card">
              <span>Almacenamiento de nuevas cargas</span>
              <strong>
                {(Number(data.account.storage_bytes) / 1024 / 1024).toFixed(1)}{" "}
                MB
              </strong>
              <span>
                de{" "}
                {(
                  Number(data.account.storage_limit_bytes) /
                  1024 /
                  1024
                ).toFixed(0)}{" "}
                MB
              </span>
            </div>
          </div>
          <div className="card">
            <h2>Cómo se utiliza tu saldo</h2>
            <p>
              Una imagen utiliza un crédito; un PDF, un crédito por página; un
              XML, un crédito por DTE. El saldo se reserva antes de procesar y
              se descuenta cuando la extracción termina. Si falla
              definitivamente, la reserva se libera. Corregir datos y exportar
              no consume créditos.
            </p>
            <p>
              La activación de paquetes es manual. Solicita la recarga al
              administrador del servicio; el saldo aparecerá después de
              confirmar el pago.
            </p>
          </div>
          <div className="card">
            <h2>Últimos 100 movimientos</h2>
            <ul className="usage-list">
              {data.ledger.map((l) => (
                <li key={l.id}>
                  <strong>
                    {l.amount > 0 ? "+" : ""}
                    {l.amount} créditos
                  </strong>{" "}
                  ·{" "}
                  {l.kind === "consume"
                    ? "Procesamiento"
                    : l.kind === "purchase"
                      ? "Recarga"
                      : "Ajuste"}
                  <br />
                  {companies.find(
                    (c) => c.id === l.extraction_jobs?.organization_id,
                  )?.name || "Cuenta del contador"}{" "}
                  {l.extraction_jobs?.filename &&
                    " · " + l.extraction_jobs.filename}
                  <br />
                  <small>
                    {new Date(l.created_at).toLocaleString("es-CL")}
                  </small>
                </li>
              ))}
            </ul>
            {!data.ledger.length && <p>Todavía no hay movimientos.</p>}
          </div>
        </>
      )}
    </div>
  );
}
