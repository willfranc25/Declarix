import logger from '../utils/logger';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getStatusLabel, getStatusVariant } from '../utils/formatters';
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
  handleTaxStatusChange,
  menuOpen,
  onToggleMenu,
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

  const isDeclared = inv.taxStatus === 'declared';

  const cells = (
    <>
      <td data-label="Fecha" className="text-mono" style={{ color: 'var(--color-text-secondary)' }} onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}>
        {formatDate(inv.date)}
      </td>
      <td
        data-label="Proveedor"
        className="truncate"
        style={{ maxWidth: 200, fontWeight: 500 }}
        title={inv.providerName}
        onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}
      >
        {inv.providerName}
      </td>
      <td data-label="Doc." className="table-mobile-hidden" style={{ color: 'var(--color-text-secondary)' }}>
        {inv.documentType}
      </td>
      <td data-label="Tipo de gasto" className="table-mobile-hidden" style={{ color: 'var(--color-text-secondary)' }}>
        {inv.expenseType}
      </td>
      <td
        data-label="Total"
        className="text-right text-mono"
        onClick={() => !isSwiped && navigate(`/invoices/${inv.id}`)}
      >
        {formatCurrency(inv.totalAmount || 0)}
      </td>

      {/* Estado binario: Pendiente (sin declarar) / Declarada (ya exportada) */}
      <td data-label="Estado">
        <span className={`badge badge-${getStatusVariant(inv.taxStatus)}`}>
          {getStatusLabel(inv.taxStatus)}
        </span>
      </td>

      {/* Acciones: menú "⋯" en vez de íconos siempre visibles (evita borrado accidental) */}
      <td data-label="Acciones" className="table-mobile-hidden text-center" style={{ position: 'relative' }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={(e) => { e.stopPropagation(); onToggleMenu(inv.id); }}
          title="Más acciones"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="row-actions-menu" role="menu" onClick={(e) => e.stopPropagation()}>
            <button role="menuitem" onClick={() => { onToggleMenu(null); navigate(`/invoices/${inv.id}`); }}>
              <Icon name="eye" size={15} /> Ver detalle
            </button>
            <button
              role="menuitem"
              onClick={() => { onToggleMenu(null); handleTaxStatusChange(inv.id, isDeclared ? 'pending' : 'declared'); }}
            >
              <Icon name={isDeclared ? 'refresh' : 'check-circle'} size={15} />
              {isDeclared ? 'Marcar pendiente' : 'Marcar declarada'}
            </button>
            <button role="menuitem" className="danger" onClick={() => { onToggleMenu(null); setDeleteId(inv.id); }}>
              <Icon name="trash" size={15} /> Eliminar
            </button>
          </div>
        )}
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
  const [openMenuId, setOpenMenuId] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const { addToast } = useToast();

  useEffect(() => {
    if (!openMenuId) return;
    const closeMenu = () => setOpenMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, [openMenuId]);

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

    // Repetir clic en un chip activo lo desactiva (quita el filtro de fecha)
    if (activePreset === preset) {
      setActivePreset(null);
      setFilters({ month: undefined, months: undefined, year: undefined });
      return;
    }
    setActivePreset(preset);

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

      {/* Chips de filtro rápido + buscador (prototipo: fila plana, sin card) */}
      <div className="flex gap-2 items-center flex-wrap">
        <button
          className={`chip ${activePreset === 'this_month' ? 'active' : ''}`}
          onClick={() => handlePresetFilter('this_month')}
        >
          Este mes
        </button>
        <button
          className={`chip ${activePreset === 'prev_month' ? 'active' : ''}`}
          onClick={() => handlePresetFilter('prev_month')}
        >
          Mes anterior
        </button>
        <button
          className={`chip ${activePreset === 'this_quarter' ? 'active' : ''}`}
          onClick={() => handlePresetFilter('this_quarter')}
        >
          Trimestre actual
        </button>
        <button
          className={`chip ${activePreset === 'tax_year' ? 'active' : ''}`}
          onClick={() => handlePresetFilter('tax_year')}
        >
          Año tributario {new Date().getFullYear()}
        </button>
        <span style={{ width: 1, height: 16, background: 'var(--color-border)', margin: '0 4px' }} aria-hidden="true" />
        <input
          className="form-input"
          placeholder="Buscar proveedor…"
          value={filters.providerSearch || ''}
          onChange={(e) => setFilters({ providerSearch: e.target.value || undefined })}
          style={{ width: 220, padding: '6px 11px', fontSize: 'var(--font-size-xs)' }}
          aria-label="Buscar proveedor"
        />
        <button
          className="chip"
          style={{ marginLeft: 'auto' }}
          onClick={() => setShowMoreFilters((v) => !v)}
          aria-expanded={showMoreFilters}
        >
          Más filtros <Icon name="chevron-down" size={13} className={showMoreFilters ? 'accordion-chevron open' : 'accordion-chevron'} style={{ width: 13, height: 13 }} />
        </button>
      </div>

      {/* Filters Form Card (colapsable) */}
      {showMoreFilters && (
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
            <label className="form-label">Estado</label>
            <select className="form-select" value={filters.taxStatus || ''} onChange={(e) => setFilters({ taxStatus: e.target.value || undefined })}>
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="declared">Declarada</option>
            </select>
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
              onClick={() => { clearFilters(); setActivePreset(null); }}
            >
              Limpiar
            </button>
          </div>
        </div>
      </div>
      )}

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
                  <th className="table-mobile-hidden">Doc.</th>
                  <th className="table-mobile-hidden">Tipo de gasto</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th className="table-mobile-hidden" style={{ width: 40 }}></th>
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
                    handleTaxStatusChange={handleTaxStatusChange}
                    menuOpen={openMenuId === inv.id}
                    onToggleMenu={(id) => setOpenMenuId((prev) => (id === null ? null : prev === id ? null : id))}
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
