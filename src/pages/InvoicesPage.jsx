import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getStatusLabel, getStatusVariant } from '../utils/formatters';
import { EXPENSE_TYPES, DOCUMENT_TYPES } from '../data/expenseTypes';

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { loadInvoices, deleteInvoice, updateInvoice, filters, setFilters, clearFilters, getFilteredInvoices, isLoading, error, clearError } = useInvoiceStore();
  const filteredInvoices = getFilteredInvoices();

  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(deleteId);
      setDeleteId(null);
    } catch {} finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try { await updateInvoice(id, { status }); } catch {}
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Comprobantes</h1>
          <p className="page-subtitle">{filteredInvoices.length} comprobantes encontrados</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/upload')}>+ Nuevo Comprobante</button>
      </div>

      {error && (
        <div className="alert alert-danger">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearError}>✕</button>
        </div>
      )}

      {/* Filters */}
      <div className="card">
        <div className="filters-bar">
          <div className="form-group">
            <label className="form-label">Año</label>
            <select className="form-select" value={filters.year || ''} onChange={(e) => setFilters({ year: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Todos</option>
              {[2026, 2025, 2024].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Mes</label>
            <select className="form-select" value={filters.month || ''} onChange={(e) => setFilters({ month: e.target.value ? Number(e.target.value) : undefined })}>
              <option value="">Todos</option>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo Gasto</label>
            <select className="form-select" value={filters.expenseType || ''} onChange={(e) => setFilters({ expenseType: e.target.value || undefined })}>
              <option value="">Todos</option>
              {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo Doc.</label>
            <select className="form-select" value={filters.documentType || ''} onChange={(e) => setFilters({ documentType: e.target.value || undefined })}>
              <option value="">Todos</option>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Proveedor</label>
            <input className="form-input" placeholder="Buscar..." value={filters.providerSearch || ''} onChange={(e) => setFilters({ providerSearch: e.target.value || undefined })} />
          </div>
          <div className="form-group" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={clearFilters}>Limpiar</button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="loading-screen"><div className="spinner" /><span>Cargando...</span></div>
      ) : filteredInvoices.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <h3 className="empty-state-title">Sin comprobantes</h3>
            <p className="empty-state-text">No se encontraron comprobantes con los filtros aplicados.</p>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th className="table-mobile-hidden">Tipo Doc.</th>
                  <th className="table-mobile-hidden">Tipo Gasto</th>
                  <th className="text-right">Total</th>
                  <th className="text-center">Estado</th>
                  <th className="text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td>{formatDate(inv.date)}</td>
                    <td className="truncate" style={{ maxWidth: 200 }}>{inv.providerName}</td>
                    <td className="table-mobile-hidden text-muted text-sm">{inv.documentType}</td>
                    <td className="table-mobile-hidden text-muted text-sm">{inv.expenseType}</td>
                    <td className="text-right text-mono font-semibold">{formatCurrency(inv.totalAmount || 0)}</td>
                    <td className="text-center">
                      <select
                        className="form-select"
                        value={inv.status}
                        onChange={(e) => handleStatusChange(inv.id, e.target.value)}
                        style={{ padding: '2px 24px 2px 6px', fontSize: '12px', minWidth: 100 }}
                      >
                        <option value="pending">Pendiente</option>
                        <option value="reviewed">Revisado</option>
                        <option value="approved">Aprobado</option>
                      </select>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/invoices/${inv.id}`)} title="Ver">👁️</button>
                        <button className="btn btn-ghost btn-sm" onClick={() => setDeleteId(inv.id)} title="Eliminar">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <div className="modal-overlay" onClick={() => !isDeleting && setDeleteId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Confirmar eliminación</h3>
              <button className="modal-close" onClick={() => setDeleteId(null)} disabled={isDeleting}>
                <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--color-text-secondary)' }}>¿Estás seguro de que deseas eliminar este comprobante? Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)} disabled={isDeleting}>Cancelar</button>
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
