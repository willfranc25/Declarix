import DocumentActivity from '../components/DocumentActivity';
import DocumentEditor from '../components/DocumentEditor';
import DocumentPreview from '../components/DocumentPreview';
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

  const [editing,setEditing] = useState(false);
  const [mimeType,setMimeType] = useState('');
  const [imageUrl, setImageUrl] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToast();

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  useEffect(() => {
    let current=true, url=null;
    getStorageProvider().getImage(id).then(blob=>{
      if(!current||!blob)return;
      url=URL.createObjectURL(blob);setImageUrl(url);setMimeType(blob.type);
    }).catch(err=>{if(current)addToast('No se pudo cargar el original: '+err.message,'error');});
    return()=>{current=false;if(url)URL.revokeObjectURL(url);};
  }, [id]);

  const invoice = invoices.find((inv) => inv.id === id);

  if (!invoice) {
    return (
      <div className="loading-screen animate-fade-in">
        <div className="spinner" />
        <span>Comprobante no disponible en la empresa seleccionada.</span><button className="btn btn-secondary" onClick={()=>navigate('/invoices')}>Volver a comprobantes</button>
      </div>
    );
  }

  const isDeclared = invoice.taxStatus === 'declared';

  const handleToggleDeclared = async () => {
    if (!window.confirm(isDeclared ? '¿Volver a estado revisado?' : '¿Confirmas que este documento ya fue incluido en tu declaración?')) return;
    try { await updateInvoice(id, { taxStatus: isDeclared ? 'reviewed' : 'declared' }); } catch(err) { addToast(err.message,'error'); }
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
        <div className="flex gap-3 items-center"><button className="btn btn-secondary" onClick={()=>setEditing(v=>!v)}>Editar datos</button>
          <span className={`badge badge-${getStatusVariant(invoice.taxStatus)}`} style={{ fontSize: '13px', padding: '4px 10px' }}>
            {getStatusLabel(invoice.taxStatus)}
          </span>
          <button className="btn btn-secondary btn-sm" onClick={handleToggleDeclared}>
            <Icon name={isDeclared ? 'refresh' : 'check-circle'} size={15} />
            {isDeclared ? 'Volver a revisado' : 'Marcar declarada'}
          </button>
          <button className="btn btn-danger btn-sm" onClick={() => setShowDeleteModal(true)}><Icon name="trash" /> Eliminar</button>
        </div>
      </div>

      {editing && <DocumentEditor invoice={invoice} onClose={()=>setEditing(false)} />}
      {/* Detail split */}
      <div className="detail-split">
        {/* Image */}
        <div>
          {imageUrl ? (
            <div className="detail-image-wrapper">
              <DocumentPreview src={imageUrl} mimeType={mimeType} title="Comprobante original" />
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

      <DocumentActivity invoice={invoice} />
      {/* Delete Modal */}
      {showDeleteModal && (
        <ConfirmDialog
          title="Confirmar eliminación"
          message={`¿Eliminar este comprobante de ${invoice.providerName}? Se conservará el original y el registro de auditoría.`}
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
