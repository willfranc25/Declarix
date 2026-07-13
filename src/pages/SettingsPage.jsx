import { useState, useEffect } from 'react';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { exportBackup, importBackup, validateBackupFile } from '../services/backupService';
import { getCurrentTheme, toggleTheme } from '../utils/theme';
import { getActiveOrganization } from '../services/organizationService';
import Icon from '../components/ui/Icon';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

const PLAN_LABELS = {
  pro: 'Suscripción Declarix',
  // Etiquetas legacy (cuentas anteriores al modelo de plan único)
  free: 'Gratis',
  independiente: 'Independiente',
  pyme: 'Pyme',
  contador: 'Contador',
};

export default function SettingsPage() {
  // Backup/Restore states
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [theme, setTheme] = useState(getCurrentTheme());
  const [confirmClear, setConfirmClear] = useState(false);
  const [pendingImport, setPendingImport] = useState(null);
  const [org, setOrg] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    getActiveOrganization().then(setOrg);
  }, []);

  const [showBackupFormat, setShowBackupFormat] = useState(false);

  // Limpieza única: la extracción con IA ahora vive solo en el backend.
  // Si quedó una API key personal guardada de versiones anteriores, se borra.
  useEffect(() => {
    (async () => {
      try {
        const storage = getStorageProvider();
        if (await storage.getSetting('vlm_api_key')) {
          await storage.saveSetting('vlm_api_key', '');
          await storage.saveSetting('vlm_provider', '');
        }
      } catch {
        // best-effort: no bloquea la página
      }
    })();
  }, []);

  const handleConfirmClear = async () => {
    try {
      const storage = getStorageProvider();
      await storage.clearAll();
      setConfirmClear(false);
      addToast('Todos los comprobantes fueron eliminados.', 'success');
      setTimeout(() => window.location.reload(), 1200);
    } catch (err) {
      setConfirmClear(false);
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportBackup();
      if (result.success) {
        addToast(`Backup creado: ${result.filename} (${result.invoices} comprobantes, ${result.images} imágenes)`, 'success');
      } else {
        addToast('Error al crear el backup: ' + result.error, 'error');
      }
    } catch (err) {
      addToast('Error inesperado: ' + err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportResult(null);
    try {
      const validation = await validateBackupFile(file);
      if (!validation.valid) {
        addToast('Archivo inválido: ' + (validation.error || 'No contiene invoices.json'), 'error');
        setFileInputKey(k => k + 1);
        return;
      }
      setPendingImport({ file, validation });
    } catch (err) {
      addToast('Error inesperado: ' + err.message, 'error');
      setFileInputKey(k => k + 1);
    }
  };

  const handleConfirmImport = async () => {
    if (!pendingImport) return;
    setImporting(true);
    try {
      const result = await importBackup(pendingImport.file, { overwrite: true, importImages: true, importSettings: true });
      setImportResult(result);

      if (result.success) {
        addToast(
          `Importación completada: ${result.invoices} comprobantes, ${result.images} imágenes` +
          (result.errors.length ? ` (${result.errors.length} errores, ver consola)` : ''),
          result.errors.length ? 'warning' : 'success'
        );
        setTimeout(() => window.location.reload(), 1200);
      } else {
        addToast('Error al importar: ' + result.error, 'error');
      }
    } catch (err) {
      addToast('Error inesperado: ' + err.message, 'error');
    } finally {
      setImporting(false);
      setPendingImport(null);
      setFileInputKey(k => k + 1);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" style={{ maxWidth: 700, margin: '0 auto' }}>
      <style>{`
        @media (max-width: 768px) {
          .settings-actions {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
            gap: 12px !important;
          }
          .settings-actions .btn,
          .settings-actions label {
            width: 100% !important;
            min-height: 44px !important;
            display: inline-flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .form-group input, 
          .form-group select, 
          .form-group button {
            min-height: 44px !important;
          }
          .accordion-header {
            min-height: 52px !important;
          }
        }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">Respaldos y preferencias</p>
        </div>
      </div>

      {/* CUENTA: plan + extracción con IA como filas internas de una sola card */}
      <div>
        <p className="settings-section-title">Cuenta</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        <div className="settings-row">
          <div>
            <p className="settings-row-title">Plan</p>
            <p className="settings-row-desc">
              {org
                ? <>{PLAN_LABELS[org.planId] || org.planId || 'Suscripción Declarix'} · Todo incluido, sin límites{org.name ? <> · {org.name}</> : null}</>
                : 'Suscripción Declarix · Todo incluido'}
            </p>
          </div>
          <a className="btn btn-secondary btn-sm" href="mailto:soporte@declarix.cl?subject=Cambio%20de%20plan">
            Cambiar de plan
          </a>
        </div>

        <div className="settings-row">
          <div>
            <p className="settings-row-title">Extracción con IA</p>
            <p className="settings-row-desc">Incluida en tu cuenta. No requiere configuración.</p>
          </div>
          <span className="badge badge-success">Activa</span>
        </div>
        </div>
      </div>

      {/* APARIENCIA */}
      <div>
        <p className="settings-section-title">Apariencia</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="settings-row">
          <div>
            <p className="settings-row-title">Tema</p>
            <p className="settings-row-desc">Actual: {theme === 'light' ? 'Claro' : 'Oscuro'}</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setTheme(toggleTheme())}>
            <Icon name={theme === 'light' ? 'moon' : 'sun'} size={15} />
            {theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro'}
          </button>
        </div>
        </div>
      </div>

      {/* DATOS: backup/restauración y eliminación como filas, sin acordeones */}
      <div>
        <p className="settings-section-title">Datos</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        <div className="settings-row settings-row-stack">
          <div>
            <p className="settings-row-title">Respaldo y restauración</p>
            <p className="settings-row-desc">Exporta todo (comprobantes, imágenes, ajustes) a un ZIP o restaura desde uno.</p>
          </div>
          <div className="settings-actions flex flex-wrap gap-3">
            <button className="btn btn-secondary btn-sm" onClick={handleExport} disabled={exporting}>
              {exporting ? <><div className="spinner" /> Generando ZIP...</> : <><Icon name="download" size={15} /> Exportar backup</>}
            </button>
            <label className="btn btn-secondary btn-sm cursor-pointer" style={{ display: 'inline-flex', alignItems: 'center' }}>
              <input
                type="file"
                accept=".zip"
                key={fileInputKey}
                onChange={handleFileSelect}
                style={{ display: 'none' }}
              />
              {importing ? <><div className="spinner" /> Importando...</> : <><Icon name="upload" size={15} /> Restaurar desde ZIP</>}
            </label>
          </div>

          {importResult && (
            <div className="alert alert-info" style={{ fontSize: '0.85rem' }}>
              <strong>Última importación:</strong><br/>
              {importResult.invoices} comprobantes · {importResult.images} imágenes · {importResult.settings} settings
              {importResult.errors.length > 0 && <> <br/> {importResult.errors.length} errores (ver consola del navegador) </>}
            </div>
          )}

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ alignSelf: 'flex-start', padding: 0 }}
            onClick={() => setShowBackupFormat((v) => !v)}
          >
            Formato del backup <Icon name="chevron-down" size={14} className={showBackupFormat ? 'accordion-chevron open' : 'accordion-chevron'} />
          </button>
          {showBackupFormat && (
            <ul className="text-sm text-muted list-disc list-inside space-y-1">
              <li><code>invoices.json</code> — Array completo de comprobantes</li>
              <li><code>settings.json</code> — Preferencias y mappings de exportación por RUT empresa</li>
              <li><code>images/</code> — Carpeta con imágenes (nombre = invoiceId.ext)</li>
              <li><code>metadata.json</code> — Versión, fecha, contadores</li>
            </ul>
          )}
        </div>

        <div className="settings-row">
          <div>
            <p className="settings-row-title">Eliminar todos los comprobantes</p>
            <p className="settings-row-desc">Borra comprobantes e imágenes de esta cuenta. No se puede deshacer.</p>
          </div>
          <button className="btn btn-danger btn-sm" onClick={() => setConfirmClear(true)}>
            <Icon name="trash" size={15} /> Eliminar todo
          </button>
        </div>
        </div>
      </div>

      {/* SOPORTE */}
      <div>
        <p className="settings-section-title">Soporte</p>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="settings-row">
          <div>
            <p className="settings-row-title">¿Necesitas ayuda?</p>
            <p className="settings-row-desc">Escríbenos y te respondemos a la brevedad.</p>
          </div>
          <a className="btn btn-secondary btn-sm" href="mailto:soporte@declarix.cl">
            soporte@declarix.cl
          </a>
        </div>
        <div className="settings-row">
          <div>
            <p className="settings-row-title">Declarix</p>
            <p className="settings-row-desc">Versión 1.0.0 · React + Vite + PWA</p>
          </div>
        </div>
        </div>
      </div>

      {confirmClear && (
        <ConfirmDialog
          title="Eliminar todos los comprobantes"
          message={'Se eliminarán TODOS los comprobantes y sus imágenes.\nEsta acción no se puede deshacer.'}
          confirmLabel="Eliminar todo"
          danger
          onConfirm={handleConfirmClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}

      {pendingImport && (
        <ConfirmDialog
          title="Restaurar backup"
          message={
            `¿Importar ${pendingImport.validation.invoiceCount} comprobantes? ` +
            `Esto ${pendingImport.validation.hasMetadata ? 'incluye settings e imágenes' : 'solo importa comprobantes'}.\n\n` +
            'Se hará upsert: actualiza si existe, crea si no.'
          }
          confirmLabel="Importar"
          loading={importing}
          onConfirm={handleConfirmImport}
          onCancel={() => {
            setPendingImport(null);
            setFileInputKey(k => k + 1);
          }}
        />
      )}
    </div>
  );
}