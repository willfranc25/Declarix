import { useEffect, useState } from "react";
import { useCompany } from "../context/CompanyContext";
import { supabase } from "../services/supabaseClient";
import { cleanRut, validateRut } from "../utils/rutValidator";
import { exportBackup, importBackup, validateBackupFile } from "../services/backupService";
import useInvoiceStore from "../store/invoiceStore";
import { EXPENSE_TYPES } from "../data/expenseTypes";
import { listStorageFailures } from "../services/storageFailureLog";
export default function SettingsPage() {
  const { activeCompany, refresh } = useCompany();
  const loadInvoices = useInvoiceStore((state) => state.loadInvoices);
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
  const [backupFile, setBackupFile] = useState(null);
  const [backupInfo, setBackupInfo] = useState(null);
  const [storageFailures, setStorageFailures] = useState([]);
  const [failuresMessage, setFailuresMessage] = useState("");
  const [loadingFailures, setLoadingFailures] = useState(false);
  const loadStorageFailures = async () => {
    if (!activeCompany?.id) return;
    setLoadingFailures(true);
    const { data, error } = await listStorageFailures(activeCompany.id);
    setStorageFailures(data || []);
    setFailuresMessage(error ? "No se pudo cargar el registro de fallos." : "");
    setLoadingFailures(false);
  };
  useEffect(() => { loadStorageFailures(); }, [activeCompany?.id]);
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
          Descarga periódicamente un ZIP con los datos y originales disponibles. Guarda una copia fuera de Declarix.
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
        <div style={{ marginTop: 'var(--space-5)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}>
          <h3>Restaurar desde un respaldo</h3>
          <p className="text-muted">Se agregan o actualizan los comprobantes incluidos y se recuperan sus imágenes. No se eliminan documentos que no estén en el ZIP.</p>
          <label className="form-label" htmlFor="backup-restore-file">Archivo de respaldo (.zip)</label>
          <input
            id="backup-restore-file"
            className="form-input"
            type="file"
            accept=".zip,application/zip"
            disabled={busy}
            onChange={async (event) => {
              const file = event.target.files?.[0] || null;
              setBackupFile(file);
              setBackupInfo(null);
              if (!file) return;
              const validation = await validateBackupFile(file);
              if (!validation.valid) {
                setBackupFile(null);
                setMessage(validation.error || 'El archivo no contiene un respaldo válido de Declarix.');
                return;
              }
              setBackupInfo(validation);
              setMessage(`Respaldo válido: ${validation.invoiceCount} comprobantes y ${validation.imageCount} originales.`);
            }}
          />
          {backupFile && backupInfo?.valid && (
            <button
              className="btn btn-secondary"
              style={{ marginTop: 'var(--space-3)' }}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  const result = await importBackup(backupFile);
                  await loadInvoices();
                  setMessage(
                    `Restauración finalizada: ${result.invoices} comprobantes y ${result.images} originales.` +
                      (result.errors.length ? ` Hubo ${result.errors.length} elementos que no se pudieron restaurar.` : ''),
                  );
                  setBackupFile(null);
                  setBackupInfo(null);
                } catch (err) {
                  setMessage(`No se pudo restaurar el respaldo: ${err.message}`);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Restaurando…' : 'Restaurar respaldo'}
            </button>
          )}
        </div>
      </div>
      <section className="card" aria-labelledby="storage-failures-title">
        <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "var(--space-3)" }}>
          <div>
            <h2 id="storage-failures-title">Registro de fallos de originales</h2>
            <p className="text-muted">Muestra intentos recientes en que no se pudo guardar el archivo o asociarlo al comprobante. No almacena imágenes ni datos tributarios.</p>
          </div>
          <button className="btn btn-secondary" type="button" disabled={loadingFailures} onClick={loadStorageFailures}>
            {loadingFailures ? "Actualizando…" : "Actualizar"}
          </button>
        </div>
        {failuresMessage && <p role="status" className="alert alert-info">{failuresMessage}</p>}
        {!loadingFailures && !failuresMessage && storageFailures.length === 0 && <p className="text-muted">No hay fallos registrados para esta empresa.</p>}
        {storageFailures.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Fecha</th><th>Etapa</th><th>Comprobante</th><th>Código</th></tr></thead>
              <tbody>{storageFailures.map((failure) => <tr key={failure.id}>
                <td>{new Date(failure.created_at).toLocaleString("es-CL")}</td>
                <td>{({ image_upload: "Subida del original", invoice_insert: "Guardado del comprobante", image_metadata_update: "Vínculo del original" })[failure.stage] || failure.stage}</td>
                <td>{failure.invoice_id || "Sin ID"}</td>
                <td>{failure.error_code}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
