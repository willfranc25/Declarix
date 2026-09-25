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
        <h1 className="page-title">Plan y consumo</h1>
        <p className="page-subtitle">
          Tu plan mensual se comparte entre todas las empresas de tu cartera.
        </p>
      </div>
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <div className="workspace-metrics">
            <div className="card">
              <span>Unidades disponibles este período</span>
              <strong>{Math.max(0, data.account.monthly_limit - data.account.monthly_used - data.account.reserved)}</strong>
            </div>
            <div className="card">
              <span>Incluidas en el plan</span>
              <strong>{data.account.monthly_limit}</strong>
            </div>
            <div className="card">
              <span>Procesadas este período</span>
              <strong>{data.account.monthly_used}</strong>
            </div>
            <div className="card">
              <span>En procesamiento</span>
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
            <h2>Tu suscripción</h2>
            <p>
              Plan {data.account.plan_code}. Estado: {data.account.subscription_status === "trialing" ? "prueba" : data.account.subscription_status === "active" ? "activa" : data.account.subscription_status === "past_due" ? "pago pendiente" : "requiere atención"}. El período actual termina el {new Date(data.account.period_end).toLocaleDateString("es-CL")}.
            </p>
            <p>
              Una imagen cuenta como una unidad; cada página de PDF y cada DTE en XML cuentan como una unidad. Se reserva capacidad al iniciar y solo se cuenta un procesamiento exitoso. Los reintentos de una falla y la revisión no cobran unidades adicionales. Al alcanzar el límite, las nuevas extracciones esperan hasta el siguiente período o un cambio de plan.
            </p>
            <p>La suscripción mensual y sus límites se comparten entre las empresas de tu cartera. El cobro en línea estará disponible al activar la integración de pagos.</p>
          </div>
          <div className="card">
            <h2>Últimos 100 movimientos</h2>
            <ul className="usage-list">
              {data.ledger.map((l) => (
                <li key={l.id}>
                  <strong>
                    {l.amount > 0 ? "+" : ""}
                    {Math.abs(l.amount)} unidades
                  </strong>{" "}
                  ·{" "}
                  {l.kind === "consume"
                    ? "Procesamiento"
                    : l.kind === "purchase"
                      ? "Ajuste de plan"
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
