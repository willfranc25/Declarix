import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import useUploadQueueStore from '../store/uploadQueueStore';
import Icon from '../components/ui/Icon';
import { ImageLightbox } from '../components/ui/ImageViewer';
import { useToast } from '../components/ui/Toast';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const { invoices, loadInvoices, setBatchInvoices, clearBatchInvoices } = useInvoiceStore();

  // La cola vive en un store global: la extracción continúa aunque el
  // usuario navegue a otra página. Esta vista solo la observa.
  const queue = useUploadQueueStore((s) => s.queue);
  const isProcessing = useUploadQueueStore((s) => s.isProcessing);
  const addFiles = useUploadQueueStore((s) => s.addFiles);
  const removeItem = useUploadQueueStore((s) => s.removeItem);
  const clearQueue = useUploadQueueStore((s) => s.clearQueue);
  const retryItem = useUploadQueueStore((s) => s.retryItem);
  const retryFailed = useUploadQueueStore((s) => s.retryFailed);

  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState(null);
  // Miniatura ampliada: { src, title } | null
  const [preview, setPreview] = useState(null);

  const { addToast } = useToast();

  // Cargar comprobantes existentes para la detección de duplicados
  useEffect(() => {
    if (invoices.length === 0) loadInvoices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Validar un archivo individual
  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Solo se permiten imágenes JPEG, PNG o WEBP.';
    if (file.size > MAX_FILE_SIZE) return 'El tamaño máximo es de 10 MB.';
    return null;
  };

  // Manejar la selección de múltiples archivos
  const handleFilesAdded = async (filesList) => {
    const validFiles = [];
    let hasInvalidFiles = false;

    for (let i = 0; i < filesList.length; i++) {
      const rawFile = filesList[i];
      if (validateFile(rawFile)) {
        hasInvalidFiles = true;
        continue;
      }
      validFiles.push(rawFile);
    }

    if (hasInvalidFiles) {
      const errorMsg = 'Algunos archivos fueron ignorados porque no son imágenes válidas o superan los 10MB.';
      setGlobalError(errorMsg);
      addToast(errorMsg, 'error');
    }

    if (validFiles.length > 0) {
      const added = await addFiles(validFiles);
      if (added > 0) {
        addToast(`${added} archivo(s) agregado(s) a la cola.`, 'success');
      }
    }
  };

  const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(false); };
  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFilesAdded(files);
    }
  };

  // Limpiar cola entera (el store libera las URLs de previsualización)
  const handleClearQueue = () => {
    clearQueue();
    setGlobalError(null);
    clearBatchInvoices();
    addToast('Cola de procesamiento limpia.', 'info');
  };

  // Eliminar un archivo específico de la cola
  const handleRemoveItem = (id) => {
    removeItem(id);
    addToast('Archivo removido de la cola.', 'info');
  };

  // Avanzar a la pantalla de revisión en lote
  const handleReviewAll = () => {
    const processedItems = queue.filter(item => item.status === 'done');
    if (processedItems.length === 0) return;

    // Mapear los datos guardando la referencia del archivo para la subida posterior
    const batchInvoicesData = processedItems.map(item => ({
      id: item.id,
      ...item.extractedData,
      isDuplicate: item.isDuplicate,
      file: item.file
    }));

    setBatchInvoices(batchInvoicesData);
    navigate('/batch-review');
  };

  // Estadísticas globales para la barra de progreso
  const totalFiles = queue.length;
  const processedFiles = queue.filter(item => item.status === 'done' || item.status === 'error').length;
  const successfulFiles = queue.filter(item => item.status === 'done').length;
  const failedFiles = queue.filter(item => item.status === 'error').length;
  const globalProgress = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in upload-page-container" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <style>{`
        .upload-page-container button,
        .upload-page-container .btn {
          min-height: 44px;
          min-width: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.1s ease, background-color 0.2s ease, opacity 0.2s ease;
        }

        .upload-page-container button:active:not(:disabled),
        .upload-page-container .btn:active:not(:disabled) {
          transform: scale(0.95) !important;
        }

        .upload-page-container .drop-zone {
          min-height: 120px;
        }

        .upload-page-container .queue-item {
          min-height: 44px;
        }

        @keyframes toastSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.95);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .toast-item {
          animation: toastSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>

      <div className="page-header">
        <div>
          <h1 className="page-title">Carga Masiva de Boletas</h1>
          <p className="page-subtitle">Sube múltiples comprobantes y la IA los procesará en cola secuencialmente.</p>
        </div>
      </div>

      {globalError && (
        <div className="alert alert-danger flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{globalError}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setGlobalError(null)}><Icon name="x" size={16} /></button>
        </div>
      )}

      {/* Zona de Dropzone */}
      <div className="card">
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ padding: '40px 20px', cursor: 'pointer' }}
        >
          <div className="empty-state-icon" style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent-light)', marginBottom: '1rem' }}>
            <Icon name="photo" size={24} />
          </div>
          <p className="drop-zone-text">
            <strong>Haz clic para elegir de tu galería</strong> o arrastra múltiples imágenes aquí
          </p>
          <p className="drop-zone-hint" style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
            Puedes seleccionar varias a la vez · JPEG, PNG o WEBP (máx. 10 MB por archivo)
          </p>
        </div>

        {/* Botón separado para foto directa con la cámara (solo toma 1 a la vez) */}
        <button
          type="button"
          className="btn btn-secondary w-full mt-4"
          onClick={(e) => {
            e.stopPropagation();
            cameraInputRef.current?.click();
          }}
        >
          <Icon name="camera" /> Tomar foto con la cámara
        </button>

        {/* Selector de galería: sin `capture` para no forzar la cámara y permitir multiselección */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
          style={{ display: 'none' }}
        />
        {/* Selector de cámara: una foto a la vez (limitación del hardware, no de la app) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {/* Barra Global de Progreso */}
      {totalFiles > 0 && (
        <div className="card p-6 space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              Progreso de procesamiento
              {isProcessing && <span className="spinner spinner-sm" />}
            </h3>
            <span className="text-sm font-medium bg-slate-800 px-3 py-1 rounded-full text-slate-300">
              {processedFiles} de {totalFiles} procesados ({successfulFiles} exitosos)
            </span>
          </div>

          <div className="progress-bar-container" style={{ background: 'var(--color-bg-primary)', height: 10, borderRadius: 999, overflow: 'hidden' }}>
            <div 
              className="progress-bar" 
              style={{ 
                width: `${globalProgress}%`, 
                height: '100%', 
                background: 'var(--gradient-accent)',
                transition: 'width 0.4s ease'
              }}
            />
          </div>

          <div className="flex justify-between items-center flex-wrap gap-3 pt-2">
            <div className="flex gap-3">
              <button 
                className="btn btn-primary" 
                onClick={handleReviewAll} 
                disabled={successfulFiles === 0}
              >
                <Icon name="pencil" /> Revisar todos ({successfulFiles} listos)
              </button>
              {failedFiles > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={retryFailed}
                  disabled={isProcessing}
                >
                  <Icon name="refresh" /> Reintentar fallidos ({failedFiles})
                </button>
              )}
              <button
                className="btn btn-secondary"
                onClick={handleClearQueue}
              >
                Limpiar Cola
              </button>
            </div>
            {isProcessing && (
              <span className="text-sm text-muted flex items-center gap-1">
                Extrayendo en segundo plano — puedes navegar a otras páginas sin perder el avance.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Cola de Archivos */}
      {queue.length > 0 && (
        <div className="card">
          <div className="card-header border-b border-slate-800 pb-4 mb-4 flex justify-between items-center">
            <h3 className="card-title">Cola de Archivos</h3>
            <span className="text-xs text-slate-400">Procesamiento secuencial activo</span>
          </div>

          <div className="divide-y divide-slate-800 space-y-4">
            {queue.map((item) => (
              <div key={item.id} className="flex gap-4 py-4 items-start flex-wrap md:flex-nowrap queue-item">
                {/* Miniatura (clic para ampliar con zoom) */}
                <button
                  type="button"
                  onClick={() => item.tempPreviewUrl && setPreview({ src: item.tempPreviewUrl, title: item.name })}
                  title="Ver boleta ampliada"
                  style={{
                    width: 60, height: 60, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                    background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)',
                    padding: 0, cursor: item.tempPreviewUrl ? 'zoom-in' : 'default'
                  }}
                >
                  {item.tempPreviewUrl ? (
                    <img src={item.tempPreviewUrl} alt={`Miniatura de ${item.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                      <Icon name="document" size={22} />
                    </div>
                  )}
                </button>

                {/* Detalles y Progreso */}
                <div style={{ flex: 1, minWidth: 200 }} className="space-y-2">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div>
                      <h4 className="font-medium text-sm text-slate-200 truncate" style={{ maxWidth: 350 }} title={item.name}>
                        {item.name}
                      </h4>
                      <span className="text-xs text-slate-400">
                        {(item.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>

                    {/* Badge de Estado */}
                    <div>
                      {item.status === 'pending' && (
                        <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                          Pendiente
                        </span>
                      )}
                      {item.status === 'waiting' && (
                        <span className="badge animate-pulse" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                          Esperando cuota...
                        </span>
                      )}
                      {item.status === 'processing' && (
                        <span className="badge animate-pulse" style={{ background: 'var(--color-info-bg)', color: 'var(--color-info)' }}>
                          Procesando...
                        </span>
                      )}
                      {item.status === 'done' && (
                        <div className="flex gap-2 items-center">
                          {item.isDuplicate && (
                            <span className="badge" style={{ background: 'var(--color-warning-bg)', color: 'var(--color-warning)' }}>
                              Posible duplicado
                            </span>
                          )}
                          <span className="badge" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
                            Listo
                          </span>
                        </div>
                      )}
                      {item.status === 'error' && (
                        <span className="badge" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)' }}>
                          Error
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso de este archivo */}
                  <div style={{ width: '100%', height: 4, background: 'var(--color-bg-primary)', borderRadius: 2, overflow: 'hidden' }}>
                    <div 
                      style={{ 
                        width: `${item.progress}%`, 
                        height: '100%', 
                        background: item.status === 'error' ? 'var(--color-danger)' : item.status === 'done' ? 'var(--color-success)' : 'var(--color-accent)',
                        transition: 'width 0.3s ease'
                      }}
                    />
                  </div>

                  {/* Mostrar errores del archivo */}
                  {item.status === 'error' && (
                    <p className="text-xs text-red-400 mt-1">
                      <Icon name="alert" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{item.error}
                    </p>
                  )}

                  {/* Mostrar previsualización de datos si ya está listo */}
                  {item.status === 'done' && item.extractedData && (
                    <div className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 space-y-1">
                      <div className="flex justify-between flex-wrap gap-2">
                        <span><strong>Prov:</strong> {item.extractedData.providerName || 'N/A'} ({item.extractedData.providerRut || 'Sin RUT'})</span>
                        <span><strong>N°:</strong> {item.extractedData.documentNumber || 'S/N'}</span>
                        <span><strong>Monto:</strong> ${Number(item.extractedData.totalAmount).toLocaleString('es-CL')}</span>
                      </div>
                    </div>
                  )}

                  {/* Skeleton loading while processing */}
                  {item.status === 'processing' && (
                    <div className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800 space-y-2">
                      <div className="skeleton skeleton-text" style={{ width: '70%', height: '12px', margin: 0 }} />
                      <div className="skeleton skeleton-text" style={{ width: '45%', height: '12px', margin: 0 }} />
                    </div>
                  )}
                </div>

                {/* Acciones del item */}
                <div style={{ alignSelf: 'center', display: 'flex', gap: 4 }}>
                  {item.status === 'error' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => retryItem(item.id)}
                      title="Reintentar extracción"
                      style={{
                        minWidth: '44px',
                        minHeight: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <Icon name="refresh" size={16} />
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm text-slate-400 hover:text-red-400"
                    onClick={() => handleRemoveItem(item.id)}
                    disabled={item.status === 'processing'}
                    title="Eliminar de la cola"
                    style={{
                      minWidth: '44px',
                      minHeight: '44px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="alert alert-info">
        <Icon name="info" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <strong>Consejo para carga masiva:</strong> Puedes arrastrar y soltar varias fotos de boletas al mismo tiempo. Se irán extrayendo secuencialmente para no saturar tu cuota de API. Cuando terminen, haz clic en <strong>Revisar todos</strong> para corregir e importarlas masivamente.
        </div>
      </div>

      {preview && (
        <ImageLightbox src={preview.src} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
