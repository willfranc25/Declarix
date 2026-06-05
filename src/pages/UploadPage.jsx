import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { extractInvoiceData } from '../services/vlmService';
import { EXPENSE_TYPES, DOCUMENT_TYPES } from '../data/expenseTypes';
import { formatRut, validateRut } from '../utils/rutValidator';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { addInvoice } = useInvoiceStore();

  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Formato no válido. Solo JPEG, PNG o WEBP.';
    if (file.size > MAX_FILE_SIZE) return 'Archivo muy grande. Máximo 10 MB.';
    return null;
  };

  const handleFileSelect = (file) => {
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setSelectedFile(file);
    setError(null);
    setExtractedData(null);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleProcess = async () => {
    if (!selectedFile) return;
    setIsProcessing(true);
    setError(null);
    try {
      const data = await extractInvoiceData(selectedFile);
      setExtractedData({
        providerName: data.providerName || '',
        providerRut: data.providerRut || '',
        documentType: data.documentType || 'Boleta',
        documentNumber: data.documentNumber || '',
        date: data.date || new Date().toISOString().split('T')[0],
        detail: data.detail || '',
        expenseType: data.expenseType || '',
        netAmount: data.netAmount || 0,
        totalBoletaServicios: data.totalBoletaServicios || 0,
        totalBoletaHonorarios: data.totalBoletaHonorarios || 0,
        specificTax: data.specificTax || 0,
        ivaAmount: data.ivaAmount || 0,
        totalAmount: data.totalAmount || 0,
        status: 'pending',
        notes: '',
      });
    } catch (err) {
      setError(err.message || 'Error al procesar la imagen.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFieldChange = (field, value) => {
    setExtractedData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    if (!extractedData) return;
    setIsSaving(true);
    try {
      await addInvoice(extractedData, selectedFile);
      navigate('/invoices');
    } catch (err) {
      setError(err.message || 'Error al guardar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setExtractedData(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6 animate-fade-in" style={{ maxWidth: 900, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Cargar Boleta</h1>
          <p className="page-subtitle">Sube una foto y la IA extraerá los datos automáticamente</p>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <span>⚠️</span>
          <div style={{ flex: 1 }}>{error}</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* Step 1: Upload */}
      {!extractedData && (
        <div className="card">
          {!selectedFile ? (
            <>
              <div
                className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="drop-zone-icon">📸</div>
                <p className="drop-zone-text">
                  <strong>Haz clic para seleccionar</strong> o arrastra una imagen aquí
                </p>
                <p className="drop-zone-hint">JPEG, PNG o WEBP hasta 10 MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ALLOWED_TYPES.join(',')}
                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                style={{ display: 'none' }}
              />
            </>
          ) : (
            <div className="space-y-4">
              <h3 className="card-title">Vista previa</h3>
              {previewUrl && (
                <div className="image-preview">
                  <img src={previewUrl} alt="Vista previa del comprobante" />
                </div>
              )}
              <div className="text-sm text-muted">
                <strong>Archivo:</strong> {selectedFile.name} — <strong>Tamaño:</strong> {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </div>

              {isProcessing && (
                <div className="flex items-center gap-3">
                  <div className="spinner" />
                  <span className="text-muted animate-pulse">Procesando imagen con IA...</span>
                </div>
              )}

              {!isProcessing && (
                <div className="flex gap-3">
                  <button className="btn btn-primary btn-lg" onClick={handleProcess}>
                    🤖 Extraer datos con IA
                  </button>
                  <button className="btn btn-secondary" onClick={handleReset}>
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Review extracted data */}
      {extractedData && (
        <div className="card animate-slide-up">
          <div className="card-header">
            <h3 className="card-title">✅ Datos Extraídos — Revisa y Confirma</h3>
          </div>

          <div className="flex gap-6" style={{ flexWrap: 'wrap' }}>
            {/* Image thumbnail */}
            {previewUrl && (
              <div style={{ width: 200, flexShrink: 0 }}>
                <div className="image-preview" style={{ maxHeight: 260 }}>
                  <img src={previewUrl} alt="Comprobante" />
                </div>
              </div>
            )}

            {/* Form */}
            <div style={{ flex: 1, minWidth: 300 }}>
              <div className="form-grid space-y-4">
                <div className="form-group">
                  <label className="form-label">Nombre Proveedor</label>
                  <input className="form-input" value={extractedData.providerName} onChange={(e) => handleFieldChange('providerName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">RUT Proveedor</label>
                  <input
                    className="form-input"
                    value={extractedData.providerRut}
                    onChange={(e) => handleFieldChange('providerRut', e.target.value)}
                    onBlur={() => {
                      if (extractedData.providerRut) handleFieldChange('providerRut', formatRut(extractedData.providerRut));
                    }}
                    style={extractedData.providerRut && !validateRut(extractedData.providerRut) ? { borderColor: 'var(--color-warning)' } : {}}
                  />
                  {extractedData.providerRut && !validateRut(extractedData.providerRut) && (
                    <span className="form-error">RUT inválido</span>
                  )}
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo Documento</label>
                  <select className="form-select" value={extractedData.documentType} onChange={(e) => handleFieldChange('documentType', e.target.value)}>
                    {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">N° Documento</label>
                  <input className="form-input" value={extractedData.documentNumber} onChange={(e) => handleFieldChange('documentNumber', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input className="form-input" type="date" value={extractedData.date} onChange={(e) => handleFieldChange('date', e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Tipo de Gasto</label>
                  <select className="form-select" value={extractedData.expenseType} onChange={(e) => handleFieldChange('expenseType', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Detalle Compra</label>
                  <input className="form-input" value={extractedData.detail} onChange={(e) => handleFieldChange('detail', e.target.value)} />
                </div>

                {/* Montos */}
                <div className="form-group">
                  <label className="form-label">Neto (Facturas/NC)</label>
                  <input className="form-input" type="number" value={extractedData.netAmount} onChange={(e) => handleFieldChange('netAmount', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">IVA</label>
                  <input className="form-input" type="number" value={extractedData.ivaAmount} onChange={(e) => handleFieldChange('ivaAmount', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Boleta Servicios</label>
                  <input className="form-input" type="number" value={extractedData.totalBoletaServicios} onChange={(e) => handleFieldChange('totalBoletaServicios', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total Boleta Honorarios</label>
                  <input className="form-input" type="number" value={extractedData.totalBoletaHonorarios} onChange={(e) => handleFieldChange('totalBoletaHonorarios', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Impuesto Específico</label>
                  <input className="form-input" type="number" value={extractedData.specificTax} onChange={(e) => handleFieldChange('specificTax', Number(e.target.value))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Total</label>
                  <input className="form-input" type="number" value={extractedData.totalAmount} onChange={(e) => handleFieldChange('totalAmount', Number(e.target.value))} style={{ fontWeight: 700 }} />
                </div>
                <div className="form-group form-full">
                  <label className="form-label">Notas</label>
                  <textarea className="form-textarea" value={extractedData.notes} onChange={(e) => handleFieldChange('notes', e.target.value)} rows={2} />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button className="btn btn-primary btn-lg" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? <><div className="spinner" /> Guardando...</> : '💾 Guardar Comprobante'}
                </button>
                <button className="btn btn-secondary" onClick={handleReset} disabled={isSaving}>
                  Descartar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="alert alert-info">
        <span>💡</span>
        <div>
          <strong>Instrucciones:</strong> Asegúrate de que la imagen sea clara y legible. Tras procesar, podrás revisar y corregir los datos extraídos antes de guardar.
        </div>
      </div>
    </div>
  );
}
