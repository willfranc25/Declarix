import logger from '../utils/logger';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate } from '../utils/formatters';
import { EXPENSE_TYPES, DOCUMENT_TYPES } from '../data/expenseTypes';
import Icon from '../components/ui/Icon';
import { ConfirmDialog } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

// Subcomponent for each invoice row, supporting swipe actions on mobile
function InvoiceRow({ 
  inv, 
  isMobile, 
  navigate, 
  setDeleteId, 
  handleStatusChange, 
  handleTaxStatusChange 
}) {
  const [startX, setStartX] = useState(0);
  const [startY, setStartY] = useState(0);
  const [currentX, setCurrentX] = useState(0);
  const [isSwiped, setIsSwiped] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);

  const maxSwipe = -100; // pixels to show the actions

  const handleTouchStart = (e) => {
    if (!isMobile) return;
    setStartX(e.touches[0].clientX);
    setStartY(e.touches[0].clientY);
    setIsDragging(true);
    setIsScrolling(false);
    setHasMoved(false);
  };

  const handleTouchMove = (e) => {
    if (!isMobile || !isDragging || isScrolling) return;
    const diffX = e.touches[0].clientX - startX;
    const diffY = e.touches[0].clientY - startY;

    // If vertical movement is greater than horizontal, treat it as a scroll, not a swipe
    if (Math.abs(diffY) > Math.abs(diffX) && !isScrolling) {
      setIsScrolling(true);
      setIsDragging(false);
      return;
    }

    setHasMoved(true);
    let offset = isSwiped ? maxSwipe + diffX : diffX;
    if (offset > 0) offset = 0;
    if (offset < maxSwipe) offset = maxSwipe;
    setCurrentX(offset);
  };

  const handleTouchEnd = () => {
    if (!isMobile) return;
    setIsDragging(false);
    if (!hasMoved) return;

    if (currentX < maxSwipe / 2) {
      setIsSwiped(true);
      setCurrentX(maxSwipe);
    } else {
      setIsSwiped(false);
      setCurrentX(0);
    }
  };

  const closeSwipe = () => {
    setIsSwiped(false);
    setCurrentX(0);
  };

  const handleCardClick = (e) => {
    // Let clicks on selects and buttons bubble naturally
    if (e.target.tagName === 'SELECT' || e.target.closest('button')) {
      return;
    }
    if (isSwiped) {
      closeSwipe();
    } else {
      navigate(`/invoices/${inv.id}`);
    }
  };

  const currentTaxStatus = inv.taxStatus || 'pending';

  const cells = (
    <>
      <td data-label="Fecha" onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}>
        {formatDate(inv.date)}
      </td>
      <td 
        data-label="Proveedor" 
        className="truncate" 
        style={{ maxWidth: 180 }} 
        title={inv.providerName}
        onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}
      >
        {inv.providerName}
      </td>
      <td data-label="Tipo Doc." className="table-mobile-hidden text-muted text-sm">
        {inv.documentType}
      </td>
      <td data-label="Tipo Gasto" className="table-mobile-hidden text-muted text-sm">
        {inv.expenseType}
      </td>
      <td 
        data-label="Total" 
        className="text-right text-mono font-semibold"
        onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}
      >
        {formatCurrency(inv.totalAmount || 0)}
      </td>
      
      {/* Flujo Interno */}
      <td data-label="Flujo Interno" className="text-center">
        <select
          className="form-select text-xs"
          value={inv.status}
          onChange={(e) => handleStatusChange(inv.id, e.target.value)}
          style={isMobile ? {
            minHeight: '44px',
            fontSize: '14px',
            width: '100%',
            padding: '8px 36px 8px 12px'
          } : {
            padding: '2px 24px 2px 6px',
            fontSize: '11px',
            minWidth: 90
          }}
        >
          <option value="pending">Pendiente</option>
          <option value="reviewed">Revisado</option>
          <option value="approved">Aprobado</option>
        </select>
      </td>

      {/* Estado Tributario */}
      <td data-label="Estado Trib." className="text-center">
        <select
          className="form-select text-xs font-semibold rounded"
          value={currentTaxStatus}
          onChange={(e) => handleTaxStatusChange(inv.id, e.target.value)}
          style={isMobile ? {
            minHeight: '44px',
            fontSize: '14px',
            width: '100%',
            padding: '8px 36px 8px 12px',
            borderRadius: '4px',
            border: '1px solid transparent',
            background: 
              currentTaxStatus === 'declared'
                ? 'var(--color-success-bg)'
                : currentTaxStatus === 'reviewed'
                ? 'var(--color-info-bg)'
                : 'var(--color-warning-bg)',
            color: 
              currentTaxStatus === 'declared'
                ? 'var(--color-success)'
                : currentTaxStatus === 'reviewed'
                ? 'var(--color-info)'
                : 'var(--color-warning)',
          } : {
            padding: '2px 24px 2px 6px',
            fontSize: '11px',
            minWidth: 110,
            borderRadius: '4px',
            border: '1px solid transparent',
            background: 
              currentTaxStatus === 'declared'
                ? 'var(--color-success-bg)'
                : currentTaxStatus === 'reviewed'
                ? 'var(--color-info-bg)'
                : 'var(--color-warning-bg)',
            color: 
              currentTaxStatus === 'declared'
                ? 'var(--color-success)'
                : currentTaxStatus === 'reviewed'
                ? 'var(--color-info)'
                : 'var(--color-warning)',
          }}
        >
          <option value="pending" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>Pendiente</option>
          <option value="reviewed" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>Revisado</option>
          <option value="declared" style={{ background: 'var(--color-bg-secondary)', color: 'var(--color-text-primary)' }}>Declarado</option>
        </select>
      </td>

      {/* Acciones */}
      <td data-label="Acciones" className="table-mobile-hidden text-center">
        <div className="flex items-center justify-center gap-1">
          <button className="btn btn-ghost btn-sm" onClick={() => navigate(`/invoices/${inv.id}`)} title="Ver"><Icon name="eye" /></button>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)' }} onClick={() => setDeleteId(inv.id)} title="Eliminar"><Icon name="trash" /></button>
        </div>
      </td>
    </>
  );

  if (isMobile) {
    const transitionStyle = isDragging ? 'none' : 'transform 0.2s ease';
    return (
      <tr 
        className="swipe-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
          padding: 0,
          margin: 0,
          marginBottom: 'var(--space-3)',
          display: 'block',
          width: '100%',
          overflow: 'hidden'
        }}
      >
        <div 
          className="swipe-content" 
          onClick={handleCardClick}
          style={{ 
            transform: `translateX(${currentX}px)`,
            transition: transitionStyle,
            display: 'block',
            width: '100%',
            padding: 'var(--space-4)',
            border: '1px solid var(--color-border)',
            boxShadow: 'var(--shadow-sm)'
          }}
        >
          {cells}
        </div>
        <div className="swipe-actions">
          <button 
            className="swipe-action-btn edit" 
            style={{ minWidth: 44, minHeight: 44 }}
            onClick={() => {
              closeSwipe();
              navigate(`/invoices/${inv.id}`);
            }}
            title="Ver"
          >
            <Icon name="eye" size={18} />
          </button>
          <button 
            className="swipe-action-btn delete" 
            style={{ minWidth: 44, minHeight: 44 }}
            onClick={() => {
              closeSwipe();
              setDeleteId(inv.id);
            }}
            title="Eliminar"
          >
            <Icon name="trash" size={18} />
          </button>
        </div>
      </tr>
    );
  }

  return (
    <tr>
      {cells}
    </tr>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const { 
    loadInvoices, 
    deleteInvoice, 
    updateInvoice, 
    updateTaxStatus, 
    filters, 
    setFilters, 
    clearFilters, 
    getFilteredInvoices, 
    isLoading, 
    error, 
    clearError 
  } = useInvoiceStore();

  const filteredInvoices = getFilteredInvoices();

  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { addToast } = useToast();

  // Mobile and Pull-to-Refresh states
  const [isMobile, setIsMobile] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullStartY, setPullStartY] = useState(0);
  const [pullStartX, setPullStartX] = useState(0);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth <= 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => { 
    loadInvoices(); 
  }, [loadInvoices]);

  const handlePageTouchStart = (e) => {
    if (!isMobile || window.scrollY > 0 || isRefreshing) return;
    setPullStartY(e.touches[0].clientY);
    setPullStartX(e.touches[0].clientX);
    setIsPulling(true);
  };

  const handlePageTouchMove = (e) => {
    if (!isMobile || !isPulling || isRefreshing) return;
    const currentY = e.touches[0].clientY;
    const currentX = e.touches[0].clientX;
    const diffY = currentY - pullStartY;
    const diffX = currentX - pullStartX;

    // If moving horizontally more than vertically, cancel pull-to-refresh
    if (Math.abs(diffX) > Math.abs(diffY)) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }

    if (diffY > 0) {
      // Apply resistance
      const distance = Math.min(diffY * 0.4, 80);
      setPullDistance(distance);
    } else {
      setPullDistance(0);
    }
  };

  const handlePageTouchEnd = async () => {
    if (!isMobile || !isPulling || isRefreshing) return;
    setIsPulling(false);
    if (pullDistance >= 60) {
      setIsRefreshing(true);
      setIsPullRefreshing(true);
      setPullDistance(60); // Keep indicator visible during refresh
      try {
        await loadInvoices();
      } catch (err) {
        logger.error(err);
      } finally {
        setIsRefreshing(false);
        setIsPullRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      await deleteInvoice(deleteId);
      setDeleteId(null);
      addToast('Comprobante eliminado.', 'success');
    } catch (err) {
      logger.error(err);
      addToast('Error al eliminar: ' + err.message, 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try { 
      await updateInvoice(id, { status }); 
    } catch (err) {
      logger.error(err);
    }
  };

  const handleTaxStatusChange = async (id, taxStatus) => {
    try { 
      await updateTaxStatus(id, taxStatus); 
    } catch (err) {
      logger.error(err);
    }
  };

  const handlePresetFilter = (preset) => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    if (preset === 'this_month') {
      setFilters({ month: currentMonth, year: currentYear, months: undefined });
    } else if (preset === 'prev_month') {
      let m = currentMonth - 1;
      let y = currentYear;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
      setFilters({ month: m, year: y, months: undefined });
    } else if (preset === 'this_quarter') {
      let months = [];
      if (currentMonth <= 3) months = [1, 2, 3];
      else if (currentMonth <= 6) months = [4, 5, 6];
      else if (currentMonth <= 9) months = [7, 8, 9];
      else months = [10, 11, 12];
      setFilters({ month: undefined, months, year: currentYear });
    } else if (preset === 'tax_year') {
      setFilters({ month: undefined, months: undefined, year: currentYear });
    }
  };

  const showSkeleton = isLoading && !isPullRefreshing;

  return (
    <div 
      className="space-y-6 animate-fade-in"
      onTouchStart={handlePageTouchStart}
      onTouchMove={handlePageTouchMove}
      onTouchEnd={handlePageTouchEnd}
    >
      {/* Pull to refresh indicator */}
      {pullDistance > 0 && (
        <div 
          className="pull-to-refresh" 
          style={{ 
            height: `${pullDistance}px`, 
            overflow: 'hidden', 
            transition: isPulling ? 'none' : 'height 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: Math.min(pullDistance / 60, 1),
            background: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-2)'
          }}
        >
          {isRefreshing ? (
            <div className="flex items-center gap-2">
              <div className="spinner" style={{ width: '16px', height: '16px', borderTopColor: 'var(--color-accent)' }} />
              <span>Actualizando...</span>
            </div>
          ) : pullDistance >= 60 ? (
            <span>↓ Soltar para actualizar</span>
          ) : (
            <span>↓ Deslizar para actualizar</span>
          )}
        </div>
      )}

      <div className="page-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="page-title">Comprobantes</h1>
          <p className="page-subtitle">{filteredInvoices.length} comprobantes encontrados</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={isMobile ? { minHeight: '44px', width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' } : {}} 
          onClick={() => navigate('/upload')}
        >
          + Nuevo Comprobante
        </button>
      </div>

      {error && (
        <div className="alert alert-danger flex justify-between items-center">
          <span>{error}</span>
          <button className="btn btn-ghost btn-sm" onClick={clearError}><Icon name="x" size={16} /></button>
        </div>
      )}

      {/* Preset Filters (Filtros Rápidos) */}
      <div className="flex gap-2 items-center flex-wrap" style={{ background: 'var(--color-bg-secondary)', padding: '10px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider mr-2">Filtros Rápidos:</span>
        <button 
          className="btn btn-secondary btn-sm" 
          style={isMobile ? { 
            padding: '10px 16px', 
            fontSize: '14px', 
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          } : { 
            padding: '6px 12px', 
            fontSize: '12px' 
          }} 
          onClick={() => handlePresetFilter('this_month')}
        >
          Este mes
        </button>
        <button 
          className="btn btn-secondary btn-sm" 
          style={isMobile ? { 
            padding: '10px 16px', 
            fontSize: '14px', 
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          } : { 
            padding: '6px 12px', 
            fontSize: '12px' 
          }} 
          onClick={() => handlePresetFilter('prev_month')}
        >
          Mes anterior
        </button>
        <button 
          className="btn btn-secondary btn-sm" 
          style={isMobile ? { 
            padding: '10px 16px', 
            fontSize: '14px', 
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          } : { 
            padding: '6px 12px', 
            fontSize: '12px' 
          }} 
          onClick={() => handlePresetFilter('this_quarter')}
        >
          Trimestre actual
        </button>
        <button 
          className="btn btn-secondary btn-sm" 
          style={isMobile ? { 
            padding: '10px 16px', 
            fontSize: '14px', 
            minHeight: '44px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center'
          } : { 
            padding: '6px 12px', 
            fontSize: '12px' 
          }} 
          onClick={() => handlePresetFilter('tax_year')}
        >
          Año tributario ({new Date().getFullYear()})
        </button>
      </div>

      {/* Filters Form Card */}
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
            <select className="form-select" value={filters.month || ''} onChange={(e) => setFilters({ month: e.target.value ? Number(e.target.value) : undefined, months: undefined })}>
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
            <label className="form-label">Estado Trib.</label>
            <select className="form-select" value={filters.taxStatus || ''} onChange={(e) => setFilters({ taxStatus: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="reviewed">Revisado</option>
              <option value="declared">Declarado</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Proveedor</label>
            <input className="form-input" placeholder="Buscar..." value={filters.providerSearch || ''} onChange={(e) => setFilters({ providerSearch: e.target.value || undefined })} />
          </div>
          <div className="form-group" style={isMobile ? { width: '100%' } : { alignSelf: 'flex-end' }}>
            <button 
              className="btn btn-ghost btn-sm" 
              style={isMobile ? { 
                minHeight: '44px', 
                width: '100%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center'
              } : {}} 
              onClick={clearFilters}
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>

      {/* Invoices List */}
      {showSkeleton ? (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton skeleton-card" style={{ width: '100%' }} />
          ))}
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="empty-state-icon"><Icon name="document" size={24} /></div>
            <h3 className="empty-state-title">Sin comprobantes</h3>
            <p className="empty-state-text">No se encontraron comprobantes con los filtros aplicados.</p>
          </div>
        </div>
      ) : (
        <div 
          className="card" 
          style={isMobile ? { 
            background: 'transparent', 
            border: 'none', 
            boxShadow: 'none', 
            padding: 0 
          } : { 
            padding: 0, 
            overflow: 'hidden' 
          }}
        >
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th className="table-mobile-hidden">Tipo Doc.</th>
                  <th className="table-mobile-hidden">Tipo Gasto</th>
                  <th className="text-right">Total</th>
                  <th className="text-center">Flujo Interno</th>
                  <th className="text-center">Estado Trib.</th>
                  <th className="table-mobile-hidden text-center">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <InvoiceRow
                    key={inv.id}
                    inv={inv}
                    isMobile={isMobile}
                    navigate={navigate}
                    setDeleteId={setDeleteId}
                    handleStatusChange={handleStatusChange}
                    handleTaxStatusChange={handleTaxStatusChange}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {deleteId && (
        <ConfirmDialog
          title="Confirmar eliminación"
          message="¿Estás seguro de que deseas eliminar este comprobante? Esta acción no se puede deshacer."
          confirmLabel="Eliminar"
          danger
          loading={isDeleting}
          onConfirm={handleDelete}
          onCancel={() => !isDeleting && setDeleteId(null)}
        />
      )}
    </div>
  );
}
