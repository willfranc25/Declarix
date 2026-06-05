import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { formatCurrency, formatDate, formatDateTime, getStatusLabel, getStatusVariant } from '../utils/formatters';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, loadInvoices, updateInvoice, deleteInvoice } = useInvoiceStore();

  const [imageUrl, setImageUrl] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    async function loadImage() {
      if (!id) return;
      const storage = getStorageProvider();
      const blob = await storage.getImage(id);
      if (blob) {
        setImageUrl(URL.createObjectURL(blob));
      }
    }
    loadImage();
    return () => { if (imageUrl) URL.revokeObjectURL(imageUrl); };
  }, [id]);

  const invoice = invoices.find((inv) => inv.id === id);

  if (!invoice) {
    return (
      <div className="loading-screen animate-fade-in">
        <div className="spinner" />
        <span>Cargando comprobante...</span>
      </div>
    );
  }

  const handleStatusChange = async (status) => {
    await updateInvoice(id, { status });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteInvoice(id);
      navigate('/invoices');
    } catch {} finally {
      setIsDeleting(false);
    }
  };

  const fields = [
    { label: 'Proveedor', value: invoice.providerName },
    { label: 'RUT', value: invoice.providerRut },
    { label: 'Tipo Documento', value: invoice.documentType },
    { label: 'N° Documento', value: invoice.documentNumber },
    { label: 'Fecha', value: formatDate(invoice.date) },
    { label: 'Tipo de Gasto', value: invoice.expenseType },
    { label: 'Detalle', value: invoice.detail, full: true },
    { label: 'Neto (Facturas/NC)', value: formatCurrency(invoice.netAmount || 0) },
    { label: 'IVA', value: formatCurrency(invoice.ivaAmount || 0) },
    { label: 'Total Boleta Servicios', value: formatCurrency(invoice.totalBoletaServicios || 0) },
    { label: 'Total Boleta Honorarios', value: formatCurrency(invoice.totalBoletaHonorarios || 0) },
    { label: 'Impuesto Específico', value: formatCurrency(invoice.specificTax || 0) },
    { label: 'Total', value: formatCurrency(invoice.totalAmount || 0), highlight: true },
    { label: 'Creado', value: formatDateTime(invoice.createdAt) },
    { label: 'Actualizado', value: formatDateTime(invoice.updatedAt) },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="btn btn-ghost btn-sm mb-4" onClick={() => navigate('/invoices')}>← Volver</button>
          <h1 className="page-title">{invoice.providerName || 'Comprobante'}</h1>
          <p className="page-subtitle">N° {invoice.documentNumber || 'Sin número'} — {formatDate(invoice.date)}</p>
        </div>
        <div className="flex gap-3">
          <select
            className="form-select"
            value={invoice.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            style={{ minWidth: 130 }}
          >
            <option value="pending">Pendiente</option>
            <option value="reviewed">Revisado</option>
            <option value="approved">Aprobado</option>
          </select>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}>🗑️ Eliminar</button>
        </div>
      </div>

      {/* Status badge */}
      <div>
        <span className={`badge badge-${getStatusVariant(invoice.status)}`} style={{ fontSize: '14px', padding: '4px 12px' }}>
          {getStatusLabel(invoice.status)}
        </span>
      </div>

      {/* Detail split */}
      <div className="detail-split">
        {/* Image */}
        <div>
          {imageUrl ? (
            <div className="detail-image-wrapper">
              <img src={imageUrl} alt="Comprobante" />
            </div>
          ) : (
            <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🖼️</div>
              <p className="text-muted mt-4">Sin imagen adjunta</p>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="card">
          <h3 className="card-title mb-4">Datos del Comprobante</h3>
          <div className="detail-info-grid">
            {fields.map((f) => (
              <div key={f.label} className={`detail-field ${f.full ? 'form-full' : ''}`}>
                <span className="detail-field-label">{f.label}</span>
                <span className={`detail-field-value ${f.highlight ? 'text-accent font-bold' : ''}`} style={f.highlight ? { fontSize: '1.25rem' } : {}}>
                  {f.value || '—'}
                </span>
              </div>
            ))}
          </div>

          {invoice.notes && (
            <div className="mt-4">
              <span className="detail-field-label">Notas</span>
              <p className="detail-field-value mt-2" style={{ color: 'var(--color-text-secondary)' }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirmar eliminación</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-text-secondary)' }}>¿Eliminar este comprobante de <strong>{invoice.providerName}</strong>? Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowDeleteModal(false)} disabled={isDeleting}>Cancelar</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
