import { useState, useEffect } from 'react';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { exportBackup, importBackup, validateBackupFile } from '../services/backupService';
import { getCurrentTheme, toggleTheme } from '../utils/theme';

export default function SettingsPage() {
  const [vlmProvider, setVlmProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Backup/Restore states
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [theme, setTheme] = useState(getCurrentTheme());

  // Accordion states
  const [openAccordions, setOpenAccordions] = useState({
    backup: true,
    data: false,
    advanced: false,
    about: false,
  });

  const toggleAccordion = (key) => {
    setOpenAccordions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  useEffect(() => {
    async function load() {
      const storage = getStorageProvider();
      const provider = await storage.getSetting('vlm_provider');
      const key = await storage.getSetting('vlm_api_key');
      if (provider) setVlmProvider(provider);
      if (key) setApiKey(key);
      setIsLoading(false);
    }
    load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaved(false);
    try {
      const storage = getStorageProvider();
      await storage.saveSetting('vlm_provider', vlmProvider);
      await storage.saveSetting('vlm_api_key', apiKey);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      alert('Error al guardar: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearData = async () => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar TODOS los comprobantes? Esta acción no se puede deshacer.')) return;
    const storage = getStorageProvider();
    await storage.clearAll();
    alert('Datos eliminados. Recarga la página.');
    window.location.reload();
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await exportBackup();
      if (result.success) {
        alert(`✅ Backup creado: ${result.filename}\n📄 ${result.invoices} comprobantes\n🖼️ ${result.images} imágenes`);
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (err) {
      alert('❌ Error inesperado: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);

    try {
      const validation = await validateBackupFile(file);
      if (!validation.valid) {
        alert('❌ Archivo inválido: ' + (validation.error || 'No contiene invoices.json'));
        return;
      }

      if (!window.confirm(`¿Importar ${validation.invoiceCount} comprobantes? ` +
        `Esto ${validation.hasMetadata ? 'incluye settings e imágenes' : 'solo importa comprobantes'}.` +
        `\n\n⚠️ Se hará upsert (actualiza si existe, crea si no).`)) {
        return;
      }

      const result = await importBackup(file, { overwrite: true, importImages: true, importSettings: true });
      setImportResult(result);

      if (result.success) {
        alert(`✅ Importación completada:\n` +
          `📄 ${result.invoices} comprobantes\n` +
          `🖼️ ${result.images} imágenes\n` +
          `⚙️ ${result.settings} settings\n` +
          (result.errors.length ? `\n⚠️ ${result.errors.length} errores (ver consola)` : ''));
        window.location.reload();
      } else {
        alert('❌ Error: ' + result.error);
      }
    } catch (err) {
      alert('❌ Error inesperado: ' + err.message);
    } finally {
      setImporting(false);
      setFileInputKey(k => k + 1);
    }
  };

  if (isLoading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <span>Cargando configuración...</span>
      </div>
    );
  }

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
            <h3 className="card-title" style={{ marginBottom: 4 }}>🎨 Apariencia</h3>
            <p className="text-sm text-muted" style={{ margin: 0 }}>
              Tema actual: {theme === 'light' ? 'Claro' : 'Oscuro'}
            </p>
          </div>
          <button
            className="btn btn-secondary"
            style={{ minHeight: '44px' }}
            onClick={() => setTheme(toggleTheme())}
          >
            {theme === 'light' ? '🌙 Cambiar a oscuro' : '☀️ Cambiar a claro'}
          </button>
        </div>
      </div>

      {/* Extracción con IA: incluida, sin configuración */}
      <div className="card">
        <h3 className="card-title" style={{ marginBottom: 8 }}>🤖 Extracción con IA</h3>
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          La extracción automática de datos desde las fotos de tus boletas está incluida
          en tu cuenta. No necesitas configurar nada.
        </p>
      </div>

      {/* Opciones avanzadas (API key propia, opcional) */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          onClick={() => toggleAccordion('advanced')}
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
          <h3 className="card-title" style={{ margin: 0 }}>🧩 Opciones avanzadas</h3>
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
            {openAccordions.advanced ? '▲' : '▼'}
          </span>
        </div>

        {openAccordions.advanced && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <p className="text-sm text-muted">
              Solo para usuarios avanzados: si prefieres usar tu propia cuenta de OpenAI o
              Google Gemini para la extracción, ingresa aquí tu API Key. Si dejas este campo
              vacío, se usa el servicio incluido.
            </p>

            <div className="space-y-4">
              <div className="form-group">
                <label className="form-label">Proveedor de IA</label>
                <select className="form-select" value={vlmProvider} onChange={(e) => setVlmProvider(e.target.value)} style={{ minHeight: '44px' }}>
                  <option value="gemini">Google Gemini</option>
                  <option value="openai">OpenAI (GPT-4o)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">API Key</label>
                <div className="flex gap-2">
                  <input
                    className="form-input"
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={vlmProvider === 'gemini' ? 'AIza...' : 'sk-...'}
                    style={{ flex: 1, minHeight: '44px' }}
                  />
                  <button 
                    className="btn btn-ghost btn-icon" 
                    onClick={() => setShowKey(!showKey)} 
                    title={showKey ? 'Ocultar' : 'Mostrar'}
                    style={{ minHeight: '44px', width: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    {showKey ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>

              {vlmProvider === 'gemini' && (
                <div className="alert alert-info">
                  <span>💡</span>
                  <div>
                    Obtén tu API Key gratis en <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>. Modelo usado: Gemini 2.5 Flash.
                  </div>
                </div>
              )}

              {vlmProvider === 'openai' && (
                <div className="alert alert-info">
                  <span>💡</span>
                  <div>
                    Obtén tu API Key en <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform</a>. Modelo usado: GPT-4o-mini.
                  </div>
                </div>
              )}

              <div className="flex gap-3 items-center">
                <button className="btn btn-primary" onClick={handleSave} disabled={isSaving} style={{ minHeight: '44px' }}>
                  {isSaving ? <><div className="spinner" /> Guardando...</> : '💾 Guardar Configuración'}
                </button>
                {saved && (
                  <span className="text-sm" style={{ color: 'var(--color-success)' }}>✅ Guardado correctamente</span>
                )}
              </div>
            </div>
          </div>
        )}
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
          <h3 className="card-title" style={{ margin: 0 }}>💾 Respaldo y Restauración</h3>
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
            {openAccordions.backup ? '▲' : '▼'}
          </span>
        </div>

        {openAccordions.backup && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <p className="text-sm text-muted">
              Exporta todo (comprobantes, imágenes, settings) a un ZIP o restaura desde uno.
            </p>

            <div className="settings-actions flex flex-wrap gap-3 mb-4">
              <button className="btn btn-primary" onClick={handleExport} disabled={exporting} style={{ minHeight: '44px' }}>
                {exporting ? <><div className="spinner" /> Generando ZIP...</> : '📥 Exportar Backup Completo'}
              </button>

              <label className="btn btn-secondary cursor-pointer" style={{ display: 'flex', alignItems: 'center', minHeight: '44px' }}>
                <input
                  type="file"
                  accept=".zip"
                  key={fileInputKey}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                {importing ? <><div className="spinner" /> Importando...</> : '📤 Restaurar desde ZIP'}
              </label>
            </div>

            {importResult && (
              <div className="alert alert-info" style={{ fontSize: '0.9rem' }}>
                <strong>Última importación:</strong><br/>
                📄 {importResult.invoices} comprobantes · 🖼️ {importResult.images} imágenes · ⚙️ {importResult.settings} settings
                {importResult.errors.length > 0 && <> <br/> {'⚠️ '} {importResult.errors.length} errores (ver consola del navegador) </>}
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
          <h3 className="card-title" style={{ margin: 0 }}>📦 Datos</h3>
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
            {openAccordions.data ? '▲' : '▼'}
          </span>
        </div>

        {openAccordions.data && (
          <div style={{ padding: '20px', borderTop: '1px solid var(--color-border)' }} className="space-y-4">
            <p className="text-sm text-muted">
              Los datos se guardan en tu navegador (IndexedDB) y sincronizan con Supabase si está configurado.
            </p>
            <button className="btn btn-danger w-full text-center" onClick={handleClearData} style={{ minHeight: '44px' }}>
              🗑️ Eliminar todos los comprobantes
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
          <h3 className="card-title" style={{ margin: 0 }}>ℹ️ Acerca de</h3>
          <span style={{ fontSize: '1rem', color: 'var(--color-text-secondary)' }}>
            {openAccordions.about ? '▲' : '▼'}
          </span>
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
    </div>
  );
}