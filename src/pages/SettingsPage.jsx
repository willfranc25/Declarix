import { useState } from "react";
import { useCompany } from "../context/CompanyContext";
import { supabase } from "../services/supabaseClient";
import { cleanRut, validateRut } from "../utils/rutValidator";
import { exportBackup } from "../services/backupService";
import { EXPENSE_TYPES } from "../data/expenseTypes";
export default function SettingsPage() {
  const { activeCompany, refresh } = useCompany();
  const [categories, setCategories] = useState(
    (activeCompany.categories?.length
      ? activeCompany.categories
      : EXPENSE_TYPES
    ).join("\n"),
  );
  const [centers, setCenters] = useState(
    (activeCompany.cost_centers || []).join("\n"),
  );
  const [rules, setRules] = useState(
    Object.entries(activeCompany.provider_rules || {})
      .map(([rut, v]) => rut + ";" + v.expenseType + ";" + (v.costCenter || ""))
      .join("\n"),
  );
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const provider_rules = {};
      for (const line of rules.split("\n").filter((s) => s.trim())) {
        const [rut, expenseType, costCenter = ""] = line
          .split(";")
          .map((v) => v.trim());
        if (!validateRut(rut) || !expenseType)
          throw new Error(
            "Cada regla necesita RUT válido y categoría: RUT;categoría;centro de costo",
          );
        provider_rules[cleanRut(rut)] = { expenseType, costCenter };
      }
      const { error } = await supabase
        .from("organizations")
        .update({
          categories: [
            ...new Set(
              categories
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            ),
          ],
          cost_centers: [
            ...new Set(
              centers
                .split("\n")
                .map((v) => v.trim())
                .filter(Boolean),
            ),
          ],
          provider_rules,
        })
        .eq("id", activeCompany.id);
      if (error) throw error;
      await refresh();
      setMessage("Configuración guardada.");
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="workspace-page">
      <div>
        <h1 className="page-title">Configuración de empresa</h1>
        <p className="page-subtitle">
          {activeCompany.name} · Estas reglas solo se aplican a esta empresa.
        </p>
      </div>
      {message && (
        <p role="status" className="alert alert-info">
          {message}
        </p>
      )}
      <form className="card company-form" onSubmit={save}>
        <label>
          Categorías de gasto (una por línea)
          <textarea
            className="form-input"
            rows={8}
            value={categories}
            onChange={(e) => setCategories(e.target.value)}
          />
        </label>
        <label>
          Centros de costo (uno por línea)
          <textarea
            className="form-input"
            rows={5}
            value={centers}
            onChange={(e) => setCenters(e.target.value)}
          />
        </label>
        <label>
          Reglas por proveedor
          <textarea
            className="form-input"
            rows={6}
            placeholder="76123456-7;Insumos;Sucursal centro"
            value={rules}
            onChange={(e) => setRules(e.target.value)}
          />
        </label>
        <p className="text-muted">
          Formato: RUT;categoría;centro de costo. Las reglas sugieren valores al
          extraer nuevos documentos; puedes corregirlos en la revisión.
        </p>
        <button className="btn btn-primary" disabled={busy}>
          Guardar configuración
        </button>
      </form>
      <div className="card">
        <h2>Respaldo de esta empresa</h2>
        <p>
          Descarga los documentos y sus datos para mantener una copia
          independiente.
        </p>
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const result = await exportBackup();
              setMessage(
                result.success
                  ? "Respaldo descargado." +
                      (result.missingOriginals
                        ? " " +
                          result.missingOriginals +
                          " comprobantes antiguos no tienen original adjunto; ver metadata.json."
                        : "")
                  : result.error,
              );
            } catch (err) {
              setMessage(err.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Descargar respaldo
        </button>
      </div>
    </div>
  );
}
