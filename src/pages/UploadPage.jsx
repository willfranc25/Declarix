import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { extractInvoiceData } from '../services/vlmService';
import { compressImage } from '../utils/imageCompression';
import Icon from '../components/ui/Icon';
import { cleanRut, formatRut, validateRut } from '../utils/rutValidator';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Custom toast hook for the toast notification system
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  
  const addToast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return { toasts, addToast, setToasts };
};

export default function UploadPage() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const { invoices, setBatchInvoices, clearBatchInvoices } = useInvoiceStore();

  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [globalError, setGlobalError] = useState(null);

  const { toasts, addToast, setToasts } = useToast();

  // Validar un archivo individual
  const validateFile = (file) => {
    if (!ALLOWED_TYPES.includes(file.type)) return 'Solo se permiten imágenes JPEG, PNG o WEBP.';
    if (file.size > MAX_FILE_SIZE) return 'El tamaño máximo es de 10 MB.';
    return null;
  };

  // Manejar la selección de múltiples archivos
  const handleFilesAdded = async (filesList) => {
    const newItems = [];
    let hasInvalidFiles = false;

    for (let i = 0; i < filesList.length; i++) {
      const rawFile = filesList[i];
      const error = validateFile(rawFile);
      if (error) {
        hasInvalidFiles = true;
        continue;
      }

      // Evitar agregar archivos repetidos a la cola actual (por nombre y tamaño)
      if (queue.some(q => q.name === rawFile.name && q.size === rawFile.size)) {
        continue;
      }

      // Comprimir/redimensionar (fotos de celular pesan 3-10 MB)
      const file = await compressImage(rawFile);

      newItems.push({
        id: Math.random().toString(36).substring(2, 11),
        file,
        // Nombre/tamaño originales: así la deduplicación por (name, size)
        // sigue funcionando aunque el archivo interno esté comprimido
        name: rawFile.name,
        size: rawFile.size,
        status: 'pending',
        progress: 0,
        error: null,
        extractedData: null,
        isDuplicate: false,
        tempPreviewUrl: URL.createObjectURL(file)
      });
    }

    if (hasInvalidFiles) {
      const errorMsg = 'Algunos archivos fueron ignorados porque no son imágenes válidas o superan los 10MB.';
      setGlobalError(errorMsg);
      addToast(errorMsg, 'error');
    }

    if (newItems.length > 0) {
      setQueue(prev => [...prev, ...newItems]);
      addToast(`${newItems.length} archivo(s) agregado(s) a la cola.`, 'success');
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

  // Procesamiento secuencial de la cola en background
  useEffect(() => {
    const processQueue = async () => {
      // Buscar el primer archivo pendiente
      const nextIndex = queue.findIndex(item => item.status === 'pending');
      if (nextIndex === -1) {
        setIsProcessing(false);
        return;
      }

      setIsProcessing(true);

      // Clonar la cola para actualizar el estado actual
      const updatedQueue = [...queue];
      const currentItem = { ...updatedQueue[nextIndex] };
      
      currentItem.status = 'processing';
      currentItem.progress = 20;
      updatedQueue[nextIndex] = currentItem;
      setQueue([...updatedQueue]);

      try {
        // Extraer usando el VLM
        const data = await extractInvoiceData(currentItem.file);
        
        // Simular progreso incremental
        currentItem.progress = 80;
        updatedQueue[nextIndex] = currentItem;
        setQueue([...updatedQueue]);

        // Detección de duplicados: mismo RUT + mismo nro doc + misma fecha
        const isDuplicate = invoices.some(inv => {
          if (!inv.providerRut || !data.providerRut) return false;
          const cleanStoreRut = cleanRut(inv.providerRut);
          const cleanExtractedRut = cleanRut(data.providerRut);
          return (
            cleanStoreRut === cleanExtractedRut &&
            String(inv.documentNumber).trim() === String(data.documentNumber).trim() &&
            inv.date === data.date
          );
        });

        currentItem.status = 'done';
        currentItem.progress = 100;
        currentItem.isDuplicate = isDuplicate;
        currentItem.extractedData = {
          providerName: data.providerName || '',
          providerRut: data.providerRut ? formatRut(data.providerRut) : '',
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
          taxStatus: 'pending',
          status: 'pending',
          notes: data.notes || '',
        };

        if (isDuplicate) {
          addToast(`Procesado: ${currentItem.name} (Posible Duplicado)`, 'warning');
        } else {
          addToast(`Procesado con éxito: ${currentItem.name}`, 'success');
        }
      } catch (err) {
        console.error(`Error procesando archivo ${currentItem.name}:`, err);
        currentItem.status = 'error';
        currentItem.progress = 100;
        currentItem.error = err.message || 'Error desconocido al procesar.';
        addToast(`Error al procesar ${currentItem.name}: ${currentItem.error}`, 'error');
      }

      updatedQueue[nextIndex] = currentItem;
      setQueue([...updatedQueue]);
      setIsProcessing(false);
    };

    if (!isProcessing) {
      processQueue();
    }
  }, [queue, isProcessing, invoices, addToast]);

  // Limpiar cola entera
  const handleClearQueue = () => {
    // Liberar URLs de previsualización para evitar fugas de memoria
    queue.forEach(item => {
      if (item.tempPreviewUrl) {
        URL.revokeObjectURL(item.tempPreviewUrl);
      }
    });
    setQueue([]);
    setIsProcessing(false);
    setGlobalError(null);
    clearBatchInvoices();
    addToast('Cola de procesamiento limpia.', 'info');
  };

  // Eliminar un archivo específico de la cola
  const handleRemoveItem = (id) => {
    const item = queue.find(q => q.id === id);
    if (item?.tempPreviewUrl) {
      URL.revokeObjectURL(item.tempPreviewUrl);
    }
    setQueue(prev => prev.filter(q => q.id !== id));
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
      file: item.file
    }));

    setBatchInvoices(batchInvoicesData);
    navigate('/batch-review');
  };

  // Estadísticas globales para la barra de progreso
  const totalFiles = queue.length;
  const processedFiles = queue.filter(item => item.status === 'done' || item.status === 'error').length;
  const successfulFiles = queue.filter(item => item.status === 'done').length;
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
            <Icon name="camera" size={24} />
          </div>
          <p className="drop-zone-text">
            <strong>Haz clic para seleccionar</strong> o arrastra múltiples imágenes aquí
          </p>
          <p className="drop-zone-hint" style={{ fontSize: '0.8rem', color: 'var(--color-text-tertiary)' }}>
            Soporta JPEG, PNG y WEBP (máx. 10 MB por archivo)
          </p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          onChange={(e) => e.target.files && handleFilesAdded(e.target.files)}
          style={{ display: 'none' }}
        />
      </div>

      {/* Barra Global de Progreso */}
      {totalFiles > 0 && (
        <div className="card p-6 space-y-4" style={{ borderLeft: '4px solid var(--color-accent)' }}>
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
              <button 
                className="btn btn-secondary" 
                onClick={handleClearQueue}
              >
                Limpiar Cola
              </button>
            </div>
            {isProcessing && (
              <span className="text-sm text-amber-500 flex items-center gap-1 animate-pulse">
                Extrayendo datos en segundo plano...
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
                {/* Miniatura o Icono */}
                <div style={{ width: 60, height: 60, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)' }}>
                  {item.tempPreviewUrl ? (
                    <img src={item.tempPreviewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-muted)' }}>
                      <Icon name="document" size={22} />
                    </div>
                  )}
                </div>

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

                {/* Botón para remover si no se está procesando */}
                <div style={{ alignSelf: 'center' }}>
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

      {/* Toast container */}
      <div style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        maxWidth: '350px',
        width: 'calc(100% - 48px)'
      }}>
        {toasts.map(toast => {
          let bg = 'var(--color-bg-elevated)';
          let border = '1px solid var(--color-border)';
          let color = 'var(--color-text-primary)';
          let iconName = 'info';
          if (toast.type === 'success') {
            bg = 'var(--color-success-bg)';
            border = '1px solid var(--color-success-border)';
            color = 'var(--color-success)';
            iconName = 'check-circle';
          } else if (toast.type === 'error') {
            bg = 'var(--color-danger-bg)';
            border = '1px solid var(--color-danger-border)';
            color = 'var(--color-danger)';
            iconName = 'alert';
          } else if (toast.type === 'warning') {
            bg = 'var(--color-warning-bg)';
            border = '1px solid var(--color-warning-border)';
            color = 'var(--color-warning)';
            iconName = 'alert';
          }
          return (
            <div
              key={toast.id}
              className="toast-item"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '8px',
                background: bg,
                border: border,
                color: color,
                backdropFilter: 'blur(8px)',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -2px rgba(0, 0, 0, 0.1)',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              <Icon name={iconName} size={18} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, color: 'var(--color-text-primary)' }}>{toast.message}</span>
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-secondary)',
                  cursor: 'pointer',
                  fontSize: '1rem',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                  minHeight: '44px',
                  minWidth: '44px',
                }}
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
