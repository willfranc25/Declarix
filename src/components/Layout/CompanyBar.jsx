import { Link } from "react-router-dom";
import { useCompany } from "../../context/CompanyContext";
export default function CompanyBar() {
  const { companies, activeCompany, selectCompany, loading, error } =
    useCompany();
  return (
    <div className="company-bar">
      <label htmlFor="active-company">Empresa de trabajo</label>
      <select
        id="active-company"
        className="form-select"
        value={activeCompany?.id || ""}
        disabled={loading}
        onChange={(e) =>
          selectCompany(companies.find((c) => c.id === e.target.value) || null)
        }
      >
        <option value="">Selecciona una empresa</option>
        {companies
          .filter((c) => !c.archived)
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.rut ? " · " + c.rut : " · RUT pendiente"}
            </option>
          ))}
      </select>
      <Link to="/">Mi cartera</Link>
      <details className="company-mobile-tools">
        <summary>Más opciones</summary>
        <nav aria-label="Herramientas de empresa">
          <Link to="/dashboard">Resumen</Link>
          <Link to="/settings">Configuración</Link>
          <Link to="/reconcile">Conciliación RCV</Link>
          <Link to="/usage">Plan y consumo</Link>
        </nav>
      </details>
      {error && <p role="alert">No se pudo cargar la cartera: {error}</p>}
    </div>
  );
}
