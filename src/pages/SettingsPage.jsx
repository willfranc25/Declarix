import { useState, useEffect } from 'react';
import { getStorageProvider } from '../services/storage/StorageProvider';

export default function SettingsPage() {
  const [vlmProvider, setVlmProvider] = useState('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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

  if (isLoading) {
    return <div className="loading-screen"><div className="spinner" /><span>Cargando configuración...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in" style={{ maxWidth: 700, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Configuración</h1>
          <p className="page-subtitle">API Keys y preferencias de la aplicación</p>
        </div>
      </div>

      {/* VLM API Config */}
      <div className="card">
        <h3 className="card-title mb-4">🤖 Extracción con IA (VLM)</h3>
        <p className="text-sm text-muted mb-4">
          Configura tu API Key para extraer datos automáticamente de las fotos de boletas.
        </p>

        <div className="space-y-4">
          <div className="form-group">
            <label className="form-label">Proveedor de IA</label>
            <select className="form-select" value={vlmProvider} onChange={(e) => setVlmProvider(e.target.value)}>
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
                style={{ flex: 1 }}
              />
              <button className="btn btn-ghost btn-icon" onClick={() => setShowKey(!showKey)} title={showKey ? 'Ocultar' : 'Mostrar'}>
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
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? <><div className="spinner" /> Guardando...</> : '💾 Guardar Configuración'}
            </button>
            {saved && (
              <span className="text-sm" style={{ color: 'var(--color-success)' }}>✅ Guardado correctamente</span>
            )}
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="card">
        <h3 className="card-title mb-4">📦 Datos</h3>
        <p className="text-sm text-muted mb-4">
          Los datos se guardan localmente en tu navegador (IndexedDB). No se envían a ningún servidor.
        </p>
        <button className="btn btn-danger" onClick={handleClearData}>
          🗑️ Eliminar todos los comprobantes
        </button>
      </div>

      {/* About */}
      <div className="card">
        <h3 className="card-title mb-4">ℹ️ Acerca de</h3>
        <div className="space-y-4">
          <div className="detail-info-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="detail-field">
              <span className="detail-field-label">Aplicación</span>
              <span className="detail-field-value">Gestor de Boletas Saludent</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Versión</span>
              <span className="detail-field-value">1.0.0</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Almacenamiento</span>
              <span className="detail-field-value">IndexedDB (Local)</span>
            </div>
            <div className="detail-field">
              <span className="detail-field-label">Framework</span>
              <span className="detail-field-value">React + Vite</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
