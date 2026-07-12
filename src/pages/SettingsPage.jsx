import { useState, useEffect } from 'react';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { exportBackup, importBackup, validateBackupFile } from '../services/backupService';
import { getCurrentTheme, toggleTheme } from '../utils/theme';
import { getActiveOrganization } from '../services/organizationService';
import Icon from '../components/ui/Icon';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

const PLAN_LABELS = {
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

  // Accordion states
  const [openAccordions, setOpenAccordions] = useState({
    backup: true,
    data: false,
    about: false,
  });

  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

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

      {/* Apariencia */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}><Icon name="swatch" />Apariencia</h3>
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Tema actual: {theme === 'light' ? 'Claro' : 'Oscuro'}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            style={{ minHeight: '44px' }}
            onClick={() => setTheme(toggleTheme())}
          >
            <Icon name={theme === 'light' ? 'moon' : 'sun'} />
            {theme === 'light' ? 'Cambiar a oscuro' : 'Cambiar a claro'}
          </button>
        </div>
      </div>

      {/* Plan actual y soporte */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}><Icon name="receipt" />Tu plan</h3>
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              {org
                ? <>Plan <strong>{PLAN_LABELS[org.planId] || org.planId || 'Gratis'}</strong>{org.name ? <> · Organización: {org.name}</> : null}</>
                : 'Plan Gratis'}
            </p>
          </div>
          <a
            className="btn btn-secondary"
            style={{ minHeight: '44px' }}
            href="mailto:soporte@declarix.cl?subject=Cambio%20de%20plan"
          >
            Cambiar de plan
          </a>
        </div>
      </div>

      {/* Extracción con IA: incluida, sin configuración */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 8 }}><Icon name="sparkles" />Extracción con IA</h3>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          La extracción automática de datos desde las fotos de tus boletas está incluida
          en tu cuenta. No necesitas configurar nada.
        </p>
      </div>

      {/* Soporte */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h3 className="card-title" style={{ marginBottom: 4 }}><Icon name="info" />¿Necesitas ayuda?</h3>
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Escríbenos y te respondemos a la brevedad.
            </p>
          </div>
          <a className="btn btn-secondary" style={{ minHeight: '44px' }} href="mailto:soporte@declarix.cl">
            soporte@declarix.cl
          </a>
        </div>
      </div>

      {/* Backup / Restore Accordion */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div 
          onClick={() => toggleAccordion('backup')}
          className="accordion-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '16px 20px',
            minHeight: '44px',
            userSelect: 'none'
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}><Icon name="archive" />Respaldo y restauración</h3>
          <Icon name="chevron-down" size={18} className={`accordion-chevron ${openAccordions.backup ? 'open' : ''}`} />
        </div>

        {openAccordions.backup && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <p className="text-sm text-muted">
              Exporta todo (comprobantes, imágenes, settings) a un ZIP o restaura desde uno.
            </p>

            <div className="settings-actions flex flex-wrap gap-3 mb-4">
              <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ minHeight: '44px' }}>
                {exporting ? <><div className="spinner" /> Generando ZIP...</> : <><Icon name="download" /> Exportar backup</>}
              </button>

              <label className="btn btn-secondary cursor-pointer" style={{ display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="file"
                  accept=".zip"
                  key={fileInputKey}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {importing ? <><div className="spinner" /> Importando...</> : <><Icon name="upload" /> Restaurar desde ZIP</>}
              </label>
            </div>

            {importResult && (
              <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
                <strong>Última importación:</strong><br/>
                {importResult.invoices} comprobantes · {importResult.images} imágenes · {importResult.settings} settings
                {importResult.errors.length > 0 && <> <br/> {importResult.errors.length} errores (ver consola del navegador) </>}
              </div>
            )}

            <details className="text-sm text-muted">
              <summary style={{ minHeight: '44px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>Formato del backup</summary>
              <ul className="mt-2 list-disc list-inside space-y-1">
                <li><code>invoices.json</code> — Array completo de comprobantes</li>
                <li><code>settings.json</code> — Preferencias y mappings de exportación por RUT empresa</li>
                <li><code>images/</code> — Carpeta con imágenes (nombre = invoiceId.ext)</li>
                <li><code>metadata.json</code> — Versión, fecha, contadores</li>
              </ul>
            </details>
          </div>
        )}
      </div>

      {/* Data Management Accordion */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div 
          onClick={() => toggleAccordion('data')}
          className="accordion-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '16px 20px',
            minHeight: '44px',
            userSelect: 'none'
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}><Icon name="database" />Datos</h3>
          <Icon name="chevron-down" size={18} className={`accordion-chevron ${openAccordions.data ? 'open' : ''}`} />
        </div>

        {openAccordions.data && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <p className="text-sm text-muted">
              Los datos se guardan en tu navegador (IndexedDB) y sincronizan con Supabase si está configurado.
            </p>
            <button className="btn btn-danger w-full text-center" onClick={() => setConfirmClear(true)} style={{ minHeight: '44px' }}>
              <Icon name="trash" /> Eliminar todos los comprobantes
            </button>
          </div>
        )}
      </div>

      {/* About Accordion */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div 
          onClick={() => toggleAccordion('about')}
          className="accordion-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            cursor: 'pointer',
            padding: '16px 20px',
            minHeight: '44px',
            userSelect: 'none'
          }}
        >
          <h3 className="card-title" style={{ margin: 0 }}><Icon name="info" />Acerca de</h3>
          <Icon name="chevron-down" size={18} className={`accordion-chevron ${openAccordions.about ? 'open' : ''}`} />
        </div>

        {openAccordions.about && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <div className="detail-info-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div className="detail-field">
                <span className="detail-field-label">Aplicación</span>
                <span className="detail-field-value">Declarix</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Versión</span>
                <span className="detail-field-value">1.0.0</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Almacenamiento</span>
                <span className="detail-field-value">IndexedDB + Supabase (opcional)</span>
              </div>
              <div className="detail-field">
                <span className="detail-field-label">Framework</span>
                <span className="detail-field-value">React + Vite + PWA</span>
              </div>
            </div>
          </div>
        )}
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