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
  const { invoices, loadInvoices } = useInvoiceStore();

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
    addToast('Cola de procesamiento limpia.', 'info');
  };

  // Eliminar un archivo específico de la cola
  const handleRemoveItem = (id) => {
    removeItem(id);
    addToast('Archivo removido de la cola.', 'info');
  };

  // La revisión lee directo de la cola: basta con navegar.
  // Las boletas que sigan extrayéndose aparecerán allí solas al terminar.
  const handleReviewAll = () => {
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
          <h1 className="page-title">Cargar boleta</h1>
          <p className="page-subtitle">Sube una o varias fotos. La IA extrae los datos y los deja listos para revisar.</p>
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

      {/* Zona de Dropzone (sin card contenedora: la dropzone ES la superficie) */}
      <div>
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''}`}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{ cursor: 'pointer' }}
        >
          <div className="drop-zone-icon">
            <Icon name="photo" size={18} />
          </div>
          <p className="drop-zone-text">
            <strong>Elige archivos</strong> o arrástralos aquí
          </p>
          <p className="drop-zone-hint">
            JPEG, PNG o WEBP · máx. 10 MB por archivo · puedes seleccionar varios a la vez
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

      {/* Card de progreso (prototipo: caption pequeño + % en mono + barra fina) */}
      {totalFiles > 0 && (
        <div className="card space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="card-title flex items-center gap-2">
                Progreso de procesamiento
                {isProcessing && <span className="spinner" style={{ width: 14, height: 14 }} />}
              </h3>
              <p className="text-xs text-muted" style={{ marginTop: 2 }}>
                {processedFiles} de {totalFiles} archivos procesados · {successfulFiles} exitosos
              </p>
            </div>
            <span
              className="text-mono font-semibold"
              style={{
                fontSize: 'var(--font-size-base)',
                color: globalProgress === 100 ? 'var(--color-success)' : 'var(--color-text-secondary)',
              }}
            >
              {globalProgress}%
            </span>
          </div>

          <div style={{ height: 6, borderRadius: 3, background: 'var(--color-border)', overflow: 'hidden' }}>
            <div
              style={{
                width: `${globalProgress}%`,
                height: '100%',
                background: globalProgress === 100 && failedFiles === 0 ? 'var(--color-success)' : 'var(--color-accent)',
                transition: 'width 0.4s ease'
              }}
            />
          </div>

          <div className="flex items-center flex-wrap gap-3">
            <button
              className="btn btn-primary"
              onClick={handleReviewAll}
              disabled={successfulFiles === 0}
              style={{ flex: 1, minWidth: 180 }}
            >
              Revisar todos ({successfulFiles} listos)
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
              Limpiar cola
            </button>
          </div>

          {isProcessing && (
            <p className="text-xs text-muted" style={{ margin: 0 }}>
              Extrayendo en segundo plano — puedes navegar a otras páginas o cerrar la ventana:
              el avance queda guardado en este dispositivo.
            </p>
          )}
        </div>
      )}

      {/* Cola de archivos (card sin padding, filas separadas por hairline) */}
      {queue.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="flex justify-between items-center" style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)' }}>
            <h3 className="card-title">Cola de archivos</h3>
            <span className="text-xs text-muted">Procesamiento secuencial</span>
          </div>

          {queue.map((item, i) => (
            <div
              key={item.id}
              className="flex gap-3 items-center queue-item"
              style={{
                padding: '14px 20px',
                borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
                flexWrap: 'wrap',
              }}
            >
              {/* Miniatura (clic para ampliar con zoom) */}
              <button
                type="button"
                onClick={() => item.tempPreviewUrl && setPreview({ src: item.tempPreviewUrl, title: item.name })}
                title="Ver boleta ampliada"
                style={{
                  width: 44, height: 44, borderRadius: 6, overflow: 'hidden', flexShrink: 0,
                  background: 'var(--color-bg-tertiary)', border: '1px solid var(--color-border)',
                  padding: 0, cursor: item.tempPreviewUrl ? 'zoom-in' : 'default',
                  minWidth: 44, minHeight: 44,
                }}
              >
                {item.tempPreviewUrl ? (
                  <img src={item.tempPreviewUrl} alt={`Miniatura de ${item.name}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                    <Icon name="document" size={20} />
                  </div>
                )}
              </button>

              {/* Detalles */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 2 }}>
                  <span className="text-sm font-semibold truncate" style={{ maxWidth: 280 }} title={item.name}>
                    {item.name}
                  </span>
                  {item.status === 'done' && item.isDuplicate && (
                    <span className="badge badge-warning">Posible duplicado</span>
                  )}
                </div>

                {item.status === 'done' && item.extractedData ? (
                  <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                    {item.extractedData.providerName || 'Proveedor sin identificar'}
                    {' · '}N° {item.extractedData.documentNumber || 'S/N'}
                    {' · '}
                    <span className="text-mono font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                      ${Number(item.extractedData.totalAmount).toLocaleString('es-CL')}
                    </span>
                  </div>
                ) : item.status === 'error' ? (
                  <p className="text-xs" style={{ color: 'var(--color-danger)', margin: 0 }}>
                    {item.error}
                  </p>
                ) : item.status === 'processing' ? (
                  <div className="skeleton skeleton-text" style={{ width: '55%', height: 10, margin: '4px 0 0' }} />
                ) : (
                  <span className="text-xs text-muted">{(item.size / 1024 / 1024).toFixed(2)} MB</span>
                )}
              </div>

              {/* Badge de estado */}
              {item.status === 'pending' && <span className="badge badge-warning" style={{ flexShrink: 0 }}>Pendiente</span>}
              {item.status === 'waiting' && <span className="badge badge-warning animate-pulse" style={{ flexShrink: 0 }}>Esperando cuota…</span>}
              {item.status === 'processing' && <span className="badge badge-info animate-pulse" style={{ flexShrink: 0 }}>Procesando…</span>}
              {item.status === 'done' && <span className="badge badge-success" style={{ flexShrink: 0 }}>Listo</span>}
              {item.status === 'error' && <span className="badge badge-danger" style={{ flexShrink: 0 }}>Error</span>}

              {/* Acciones del item */}
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                {item.status === 'error' && (
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => retryItem(item.id)}
                    title="Reintentar extracción"
                  >
                    <Icon name="refresh" size={15} />
                  </button>
                )}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => handleRemoveItem(item.id)}
                  disabled={item.status === 'processing'}
                  title="Quitar de la cola"
                  aria-label="Quitar de la cola"
                >
                  <Icon name="x" size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tip (prototipo: fondo accentSubtle, sin ícono) */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--color-accent-glow)',
          fontSize: 'var(--font-size-base)',
          color: 'var(--color-text-secondary)',
        }}
      >
        <span style={{ fontWeight: 700, color: 'var(--color-accent)', flexShrink: 0 }}>Tip</span>
        <span>
          Arrastra varias fotos a la vez — se procesan en secuencia y el avance queda guardado
          aunque cierres la ventana. Cuando terminen, usa{' '}
          <strong style={{ color: 'var(--color-text-primary)' }}>Revisar todos</strong> para corregir e importar en lote.
        </span>
      </div>

      {preview && (
        <ImageLightbox src={preview.src} title={preview.title} onClose={() => setPreview(null)} />
      )}
    </div>
  );
}
