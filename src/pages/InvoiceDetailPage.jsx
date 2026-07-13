import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { formatCurrency, formatDate, formatDateTime, getStatusLabel, getStatusVariant } from '../utils/formatters';
import Icon from '../components/ui/Icon';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { invoices, loadInvoices, updateInvoice, deleteInvoice } = useInvoiceStore();

  const [imageUrl, setImageUrl] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToast();

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

  const isDeclared = invoice.taxStatus === 'declared';

  const handleToggleDeclared = async () => {
    await updateInvoice(id, { taxStatus: isDeclared ? 'pending' : 'declared' });
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteInvoice(id);
      addToast('Comprobante eliminado.', 'success');
      navigate('/invoices');
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    } finally {
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
        <div className="flex gap-3 items-center">
          <span className={`badge badge-${getStatusVariant(invoice.taxStatus)}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
            {getStatusLabel(invoice.taxStatus)}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={handleToggleDeclared}>
            <Icon name={isDeclared ? 'refresh' : 'check-circle'} size={15} />
            {isDeclared ? 'Marcar pendiente' : 'Marcar declarada'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}><Icon name="trash" /> Eliminar</button>
        </div>
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
              <div className="empty-state-icon">
                <Icon name="photo" size={24} />
              </div>
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
        <ConfirmDialog
          title="Confirmar eliminación"
          message={`¿Eliminar este comprobante de ${invoice.providerName}? Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          danger
          loading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => !isDeleting && setShowDeleteModal(false)}
        />
      )}
    </div>
  );
}
