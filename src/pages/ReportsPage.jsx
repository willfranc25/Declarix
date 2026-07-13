import logger from '../utils/logger';
import { useState, useMemo, useRef, useEffect } from 'react';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getMonthName, getStatusLabel, getStatusVariant } from '../utils/formatters';
import { exportToRendicion, exportToExcel, exportToCSV, downloadFile } from '../services/exportService';
import { validateRut, cleanRut, formatRut } from '../utils/rutValidator';
import { getStorageProvider } from '../services/storage/StorageProvider';
import { EXPENSE_TYPES, DOCUMENT_TYPES } from '../data/expenseTypes';
import Icon from '../components/ui/Icon';
import { ConfirmDialog, useDialogBehavior } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';

const DEFAULT_MAPPING = {
  providerName: 'A',
  providerRut: 'B',
  documentType: 'C',
  documentNumber: 'D',
  date: 'E',
  detail: 'F',
  expenseType: 'G',
  netAmount: 'H',
  totalBoletaServicios: 'I',
  totalBoletaHonorarios: 'J',
  specificTax: 'K'
};

const MAPPING_LABELS = {
  providerName: 'Nombre Proveedor',
  providerRut: 'RUT Proveedor',
  documentType: 'Tipo Documento',
  documentNumber: 'N° Documento',
  date: 'Fecha',
  detail: 'Detalle Compra',
  expenseType: 'Tipo de Gasto',
  netAmount: 'Neto (Facturas/NC)',
  totalBoletaServicios: 'Total Boleta Servicios',
  totalBoletaHonorarios: 'Total Boleta Honorarios',
  specificTax: 'Impuesto Específico'
};

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

/** Mes anterior al actual: el período que normalmente se declara (F29). */
function previousMonth() {
  const now = new Date();
  let m = now.getMonth(); // getMonth() es 0-based → ya es "mes anterior" en 1-based
  let y = now.getFullYear();
  if (m === 0) {
    m = 12;
    y -= 1;
  }
  return { month: m, year: y };
}

const pad2 = (n) => String(n).padStart(2, '0');

export default function ReportsPage() {
  const invoices = useInvoiceStore((state) => state.invoices);
  const loadInvoices = useInvoiceStore((state) => state.loadInvoices);
  const updateInvoice = useInvoiceStore((state) => state.updateInvoice);
  const markDeclared = useInvoiceStore((state) => state.markDeclared);

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  // ── Período: Mes / Rango de meses / Año tributario ──
  const [periodMode, setPeriodMode] = useState('month');
  const [month, setMonth] = useState(previousMonth());
  const [rangeFrom, setRangeFrom] = useState(previousMonth());
  const [rangeTo, setRangeTo] = useState(previousMonth());
  const [taxYear, setTaxYear] = useState(new Date().getFullYear());
  // Filtro de estado: por defecto se trabaja sobre lo pendiente de declarar
  const [statusChip, setStatusChip] = useState('all');

  // Años disponibles: los presentes en los datos + el actual
  const availableYears = useMemo(() => {
    const years = new Set([new Date().getFullYear()]);
    invoices.forEach((inv) => {
      const y = Number(String(inv.date).slice(0, 4));
      if (!Number.isNaN(y)) years.add(y);
    });
    return Array.from(years).sort((a, b) => b - a);
  }, [invoices]);

  // Rango [desde, hasta] en formato ISO según el modo activo
  const periodRange = useMemo(() => {
    if (periodMode === 'month') {
      const start = `${month.year}-${pad2(month.month)}-01`;
      const lastDay = new Date(month.year, month.month, 0).getDate();
      return [start, `${month.year}-${pad2(month.month)}-${pad2(lastDay)}`];
    }
    if (periodMode === 'range') {
      // Si el usuario invierte el rango, se corrige solo
      let a = rangeFrom;
      let b = rangeTo;
      if (a.year > b.year || (a.year === b.year && a.month > b.month)) [a, b] = [b, a];
      const start = `${a.year}-${pad2(a.month)}-01`;
      const lastDay = new Date(b.year, b.month, 0).getDate();
      return [start, `${b.year}-${pad2(b.month)}-${pad2(lastDay)}`];
    }
    return [`${taxYear}-01-01`, `${taxYear}-12-31`];
  }, [periodMode, month, rangeFrom, rangeTo, taxYear]);

  // Comprobantes del período (más filtro de estado)
  const periodInvoices = useMemo(() => {
    const [start, end] = periodRange;
    return invoices
      .filter((inv) => inv.date >= start && inv.date <= end)
      .filter((inv) => {
        if (statusChip === 'pending') return inv.taxStatus !== 'declared';
        if (statusChip === 'declared') return inv.taxStatus === 'declared';
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [invoices, periodRange, statusChip]);

  // ── Selección por fila: al cambiar el período se seleccionan todas ──
  const [selectedIds, setSelectedIds] = useState(new Set());
  const periodKey = `${periodRange[0]}|${periodRange[1]}|${statusChip}`;
  const prevPeriodKey = useRef(null);

  useEffect(() => {
    if (prevPeriodKey.current !== periodKey) {
      prevPeriodKey.current = periodKey;
      setSelectedIds(new Set(periodInvoices.map((inv) => inv.id)));
    } else {
      // Mantener la selección coherente si cambian los datos (ej. borrado)
      setSelectedIds((prev) => {
        const valid = new Set(periodInvoices.map((inv) => inv.id));
        const next = new Set([...prev].filter((id) => valid.has(id)));
        return next.size === prev.size ? prev : next;
      });
    }
  }, [periodKey, periodInvoices]);

  const selectedRows = useMemo(
    () => periodInvoices.filter((inv) => selectedIds.has(inv.id)),
    [periodInvoices, selectedIds]
  );

  const allSelected = periodInvoices.length > 0 && selectedIds.size === periodInvoices.length;

  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(periodInvoices.map((inv) => inv.id)));
  };

  const toggleOne = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const totals = useMemo(() => selectedRows.reduce((acc, inv) => ({
    netAmount: acc.netAmount + (inv.netAmount || 0),
    ivaAmount: acc.ivaAmount + (inv.ivaAmount || 0),
    totalAmount: acc.totalAmount + (inv.totalAmount || 0),
  }), { netAmount: 0, ivaAmount: 0, totalAmount: 0 }), [selectedRows]);

  // ── Plantilla de rendición + mapping (modal "Configurar plantilla") ──
  const templateInputRef = useRef(null);
  const [templateBuffer, setTemplateBuffer] = useState(null);
  const [templateName, setTemplateName] = useState('');
  const [templateSize, setTemplateSize] = useState(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [rutEmpresa, setRutEmpresa] = useState('');
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);

  const [editingInvoice, setEditingInvoice] = useState(null);
  const [confirmExport, setConfirmExport] = useState(false);

  const { addToast } = useToast();
  const templateModalRef = useRef(null);
  const editModalRef = useRef(null);
  useDialogBehavior(templateModalRef, () => setShowTemplateModal(false), showTemplateModal);
  useDialogBehavior(editModalRef, () => setEditingInvoice(null), Boolean(editingInvoice));

  // RUTs de proveedores para sugerir el RUT de la empresa en el mapping
  const distinctInvoicesRuts = useMemo(() => {
    const ruts = new Set();
    invoices.forEach(inv => {
      if (inv.providerRut) ruts.add(formatRut(inv.providerRut));
    });
    return Array.from(ruts);
  }, [invoices]);

  useEffect(() => {
    if (showTemplateModal && !rutEmpresa && distinctInvoicesRuts.length > 0) {
      setRutEmpresa(distinctInvoicesRuts[0]);
    }
  }, [showTemplateModal, rutEmpresa, distinctInvoicesRuts]);

  // Cargar mapping guardado para la empresa activa
  useEffect(() => {
    async function loadMapping() {
      if (!rutEmpresa) return;
      try {
        const storage = getStorageProvider();
        const rutClean = cleanRut(rutEmpresa);
        // Fallback al prefijo legacy de versiones anteriores
        const saved = (await storage.getSetting(`export_mapping_${rutClean}`))
          || (await storage.getSetting(`saludent_mapping_${rutClean}`));
        setMapping(saved || DEFAULT_MAPPING);
      } catch (err) {
        logger.error('Error al cargar mapping:', err);
      }
    }
    loadMapping();
  }, [rutEmpresa]);

  const handleSaveMapping = async () => {
    if (!rutEmpresa) {
      addToast('Especifica el RUT de la empresa para asociar este mapping.', 'warning');
      return;
    }
    if (!validateRut(rutEmpresa)) {
      addToast('El RUT de la empresa ingresado no es válido.', 'warning');
      return;
    }

    try {
      const storage = getStorageProvider();
      const key = `export_mapping_${cleanRut(rutEmpresa)}`;
      const upperMapping = {};
      Object.keys(mapping).forEach(k => {
        upperMapping[k] = (mapping[k] || '').toUpperCase();
      });
      await storage.saveSetting(key, upperMapping);
      addToast(`Configuración guardada para la empresa RUT ${formatRut(rutEmpresa)}.`, 'success');
      setShowTemplateModal(false);
    } catch (err) {
      addToast('Error al guardar: ' + err.message, 'error');
    }
  };

  // Plantilla por defecto (public/template.xlsm) al iniciar
  useEffect(() => {
    const loadDefaultTemplate = async () => {
      try {
        const response = await fetch('/template.xlsm');
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          setTemplateBuffer(buffer);
          setTemplateName('template.xlsm');
          setTemplateSize(buffer.byteLength);
        }
      } catch (error) {
        logger.error('Error cargando plantilla por defecto:', error);
      }
    };
    loadDefaultTemplate();
  }, []);

  const processTemplateFile = (file) => {
    if (!file) return;
    setTemplateName(file.name);
    setTemplateSize(file.size);
    const reader = new FileReader();
    reader.onload = (ev) => setTemplateBuffer(ev.target.result);
    reader.readAsArrayBuffer(file);
  };

  // ── Validación pre-exportación sobre las filas SELECCIONADAS ──
  const rowIssues = useMemo(() => {
    const issues = new Map();
    periodInvoices.forEach((inv) => {
      const invErrors = [];
      if (!inv.providerRut) {
        invErrors.push('Falta el RUT del proveedor.');
      } else if (!validateRut(inv.providerRut)) {
        invErrors.push(`RUT proveedor inválido: "${inv.providerRut}"`);
      }

      if (!inv.date) {
        invErrors.push('Falta la fecha.');
      } else {
        const d = new Date(inv.date + 'T00:00:00');
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (isNaN(d.getTime())) {
          invErrors.push(`Fecha inválida: "${inv.date}"`);
        } else if (d > today) {
          invErrors.push(`La fecha es futura: "${inv.date}"`);
        }
      }

      if ((Number(inv.totalAmount) || 0) === 0) {
        invErrors.push('El monto total es cero (0).');
      }

      if (invErrors.length > 0) issues.set(inv.id, invErrors);
    });
    return issues;
  }, [periodInvoices]);

  const selectedIssuesCount = selectedRows.filter((inv) => rowIssues.has(inv.id)).length;

  // ── Exportaciones (operan sobre la selección) ──
  const doExportRendicion = async () => {
    try {
      const activeMapping = rutEmpresa ? mapping : null;
      const rows = selectedRows;
      const data = await exportToRendicion(rows, templateBuffer, {
        fechaRendicion: formatDate(new Date().toISOString().split('T')[0]),
        rut: rutEmpresa || ''
      }, activeMapping);

      const filename = `Rendicion-${new Date().toISOString().split('T')[0]}.xlsx`;
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      downloadFile(data, filename, mimeType);

      // La rendición ES la declaración: marcar lo exportado como declarado
      const toMark = rows.filter((r) => r.taxStatus !== 'declared').map((r) => r.id);
      if (toMark.length > 0) {
        try {
          await markDeclared(toMark);
          addToast(`Rendición exportada. ${toMark.length} boleta(s) marcadas como declaradas.`, 'success');
        } catch {
          addToast(`Rendición exportada: ${filename} (no se pudo actualizar el estado).`, 'warning');
        }
      } else {
        addToast(`Rendición exportada: ${filename}`, 'success');
      }
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const handleExportRendicion = () => {
    if (selectedRows.length === 0) return;
    if (!templateBuffer) {
      addToast('Primero carga la plantilla Excel (.xlsm o .xlsx) en "Configurar plantilla".', 'warning');
      setShowTemplateModal(true);
      return;
    }
    if (selectedIssuesCount > 0) {
      setConfirmExport(true);
      return;
    }
    doExportRendicion();
  };

  const handleExportExcel = async () => {
    if (selectedRows.length === 0) return;
    try {
      const data = await exportToExcel(selectedRows, { includeMonthlySheet: true, includeCategorySheet: true });
      downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const handleExportCSV = () => {
    if (selectedRows.length === 0) return;
    const data = exportToCSV(selectedRows);
    downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  };

  // Preview dinámico de celda en el modal de configuración
  const getCellPreview = (fieldKey) => {
    const col = mapping[fieldKey] || '';
    if (!col) return '(Ignorado)';
    const firstVal = selectedRows[0] ? selectedRows[0][fieldKey] : null;
    return `Columna ${col.toUpperCase()}21: "${firstVal !== null && firstVal !== undefined ? firstVal : '—'}"`;
  };

  // Guardar corrección hecha desde el modal de edición
  const handleSaveEditingInvoice = async (e) => {
    e.preventDefault();
    if (!editingInvoice) return;
    try {
      const { id, ...updates } = editingInvoice;
      await updateInvoice(id, updates);
      setEditingInvoice(null);
      addToast('Comprobante corregido.', 'success');
    } catch (err) {
      addToast('Error al corregir el comprobante: ' + err.message, 'error');
    }
  };

  const monthSelect = (value, onChange, ariaLabel) => (
    <select
      className="form-select"
      value={value.month}
      onChange={(e) => onChange({ ...value, month: Number(e.target.value) })}
      style={{ width: 150 }}
      aria-label={ariaLabel}
    >
      {MONTHS.map((m) => <option key={m} value={m}>{getMonthName(m)}</option>)}
    </select>
  );

  const yearSelect = (value, onChange, ariaLabel) => (
    <select
      className="form-select"
      value={value.year}
      onChange={(e) => onChange({ ...value, year: Number(e.target.value) })}
      style={{ width: 105 }}
      aria-label={ariaLabel}
    >
      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
    </select>
  );

  return (
    <div className="space-y-6 animate-fade-in" style={{ paddingBottom: 0 }}>
      <style>{`
        .report-table-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 18px;
          border-bottom: 1px solid var(--color-border);
          background: var(--color-bg-tertiary);
          flex-wrap: wrap;
        }
        .report-row-issue {
          color: var(--color-warning);
          display: inline-flex;
          background: none;
          border: none;
          cursor: pointer;
          padding: 2px;
          vertical-align: middle;
        }
        input[type="checkbox"].report-check {
          width: 15px;
          height: 15px;
          accent-color: var(--color-accent);
          cursor: pointer;
        }
        @media (max-width: 768px) {
          .report-period-controls {
            flex-direction: column;
            align-items: stretch !important;
          }
          .report-period-controls select {
            width: 100% !important;
          }
          .mapping-grid-header { display: none !important; }
          .mapping-grid-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            border-bottom: 1px solid var(--color-border) !important;
            padding-bottom: 12px !important;
            margin-bottom: 12px !important;
          }
        }
        .mapping-modal-dialog {
          max-width: 620px;
          width: 92%;
        }
        @media (max-width: 768px) {
          .mapping-modal-dialog { max-width: 100%; width: 100%; }
        }
      `}</style>

      <div className="page-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">Elige un período y selecciona qué comprobantes exportar.</p>
        </div>
        <button className="btn btn-secondary" onClick={() => setShowTemplateModal(true)}>
          <Icon name="settings" size={15} /> Configurar plantilla
        </button>
      </div>

      {/* Selector de modo de período */}
      <div className="seg-control" role="group" aria-label="Modo de período">
        <button className={periodMode === 'month' ? 'active' : ''} onClick={() => setPeriodMode('month')}>
          Mes
        </button>
        <button className={periodMode === 'range' ? 'active' : ''} onClick={() => setPeriodMode('range')}>
          Rango de meses
        </button>
        <button className={periodMode === 'year' ? 'active' : ''} onClick={() => setPeriodMode('year')}>
          Año tributario
        </button>
      </div>

      {/* Controles del período */}
      <div className="card">
        <div className="report-period-controls flex items-center gap-4 flex-wrap">
          {periodMode === 'month' && (
            <div className="flex items-center gap-2 flex-wrap">
              <label className="form-label" style={{ marginRight: 4 }}>Mes</label>
              {monthSelect(month, setMonth, 'Mes')}
              {yearSelect(month, setMonth, 'Año')}
            </div>
          )}

          {periodMode === 'range' && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="form-label">Desde</label>
                {monthSelect(rangeFrom, setRangeFrom, 'Mes desde')}
                {yearSelect(rangeFrom, setRangeFrom, 'Año desde')}
              </div>
              <span style={{ color: 'var(--color-text-tertiary)' }}>—</span>
              <div className="flex items-center gap-2">
                <label className="form-label">Hasta</label>
                {monthSelect(rangeTo, setRangeTo, 'Mes hasta')}
                {yearSelect(rangeTo, setRangeTo, 'Año hasta')}
              </div>
            </div>
          )}

          {periodMode === 'year' && (
            <div className="flex items-center gap-2">
              <label className="form-label" style={{ marginRight: 4 }}>Año tributario</label>
              <select
                className="form-select"
                value={taxYear}
                onChange={(e) => setTaxYear(Number(e.target.value))}
                style={{ width: 120 }}
                aria-label="Año tributario"
              >
                {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}

          {/* Estado: todas / pendientes / declaradas */}
          <div className="flex items-center gap-2" style={{ marginLeft: 'auto' }}>
            <button className={`chip ${statusChip === 'all' ? 'active' : ''}`} onClick={() => setStatusChip('all')}>
              Todas
            </button>
            <button className={`chip ${statusChip === 'pending' ? 'active' : ''}`} onClick={() => setStatusChip('pending')}>
              Pendientes
            </button>
            <button className={`chip ${statusChip === 'declared' ? 'active' : ''}`} onClick={() => setStatusChip('declared')}>
              Declaradas
            </button>
          </div>
        </div>
      </div>

      {/* Aviso de datos incompletos en la selección */}
      {selectedIssuesCount > 0 && (
        <div className="alert alert-warning" style={{ padding: 'var(--space-3) var(--space-4)' }}>
          <Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <div className="text-sm">
            {selectedIssuesCount} comprobante(s) seleccionados tienen datos incompletos.
            Haz clic en el ícono <Icon name="alert" size={12} style={{ verticalAlign: -1 }} /> de la fila para corregirlos antes de exportar.
          </div>
        </div>
      )}

      {/* Tabla de comprobantes del período */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="report-table-bar">
          <input
            type="checkbox"
            className="report-check"
            checked={allSelected}
            onChange={toggleAll}
            aria-label="Seleccionar todo"
          />
          <span className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>
            Seleccionar todo
          </span>
          <span className="text-xs" style={{ marginLeft: 'auto', color: 'var(--color-text-tertiary)' }}>
            {periodInvoices.length} comprobante(s) en este período
          </span>
        </div>

        {periodInvoices.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Icon name="document" size={24} /></div>
            <h3 className="empty-state-title">Sin comprobantes en el período</h3>
            <p className="empty-state-text">
              Cambia el período o el filtro de estado, o carga boletas nuevas para verlas aquí.
            </p>
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}></th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th className="table-mobile-hidden">Tipo de gasto</th>
                  <th className="text-right">Total</th>
                  <th>Estado</th>
                  <th style={{ width: 40 }}></th>
                </tr>
              </thead>
              <tbody>
                {periodInvoices.map((inv) => (
                  <tr
                    key={inv.id}
                    onClick={() => toggleOne(inv.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td data-label="Seleccionar" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        className="report-check"
                        checked={selectedIds.has(inv.id)}
                        onChange={() => toggleOne(inv.id)}
                        aria-label={`Seleccionar ${inv.providerName}`}
                      />
                    </td>
                    <td data-label="Fecha" className="text-mono" style={{ color: 'var(--color-text-secondary)' }}>
                      {formatDate(inv.date)}
                    </td>
                    <td data-label="Proveedor" className="truncate" style={{ maxWidth: 220, fontWeight: 500 }} title={inv.providerName}>
                      {inv.providerName}
                    </td>
                    <td data-label="Tipo de gasto" className="table-mobile-hidden" style={{ color: 'var(--color-text-secondary)' }}>
                      {inv.expenseType}
                    </td>
                    <td data-label="Total" className="text-right text-mono">
                      {formatCurrency(inv.totalAmount || 0)}
                    </td>
                    <td data-label="Estado">
                      <span className={`badge badge-${getStatusVariant(inv.taxStatus)}`}>
                        {getStatusLabel(inv.taxStatus)}
                      </span>
                    </td>
                    <td data-label="Avisos" onClick={(e) => e.stopPropagation()}>
                      {rowIssues.has(inv.id) && (
                        <button
                          type="button"
                          className="report-row-issue"
                          title={rowIssues.get(inv.id).join(' · ') + ' — clic para corregir'}
                          onClick={() => setEditingInvoice(inv)}
                          aria-label="Corregir datos incompletos"
                        >
                          <Icon name="alert" size={15} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barra sticky de exportación: refleja la selección actual */}
      <div className="export-bar">
        <div className="export-bar-summary">
          <strong>{selectedIds.size}</strong> comprobante(s) seleccionados
          {' · '}Neto <span className="mono">{formatCurrency(totals.netAmount)}</span>
          {' · '}IVA <span className="mono">{formatCurrency(totals.ivaAmount)}</span>
          {' · '}Total <span className="mono">{formatCurrency(totals.totalAmount)}</span>
        </div>
        <div className="export-bar-actions">
          <button className="btn btn-secondary" onClick={handleExportCSV} disabled={selectedIds.size === 0}>
            CSV
          </button>
          <button className="btn btn-secondary" onClick={handleExportExcel} disabled={selectedIds.size === 0}>
            Excel simple
          </button>
          <button className="btn btn-primary" onClick={handleExportRendicion} disabled={selectedIds.size === 0}>
            Exportar a plantilla de rendición
          </button>
        </div>
      </div>

      {/* Modal: Configurar plantilla + mapping de columnas */}
      {showTemplateModal && (
        <div className="modal-overlay" onClick={() => setShowTemplateModal(false)}>
          <div ref={templateModalRef} className="modal mapping-modal-dialog" role="dialog" aria-modal="true" aria-label="Configurar plantilla de rendición" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Configurar plantilla de rendición</h3>
              <button className="modal-close" onClick={() => setShowTemplateModal(false)} aria-label="Cerrar">
                <Icon name="x" size={18} />
              </button>
            </div>

            <div className="modal-body space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Plantilla activa */}
              <div className="form-group">
                <label className="form-label">Plantilla Excel (.xlsm / .xlsx)</label>
                <div className="flex items-center gap-3 flex-wrap" style={{
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  padding: '10px 12px',
                }}>
                  <Icon name="table" size={18} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 140 }}>
                    {templateBuffer ? (
                      <>
                        <div className="text-sm font-semibold truncate">{templateName}</div>
                        <div className="text-xs text-muted">
                          {templateSize ? `${(templateSize / 1024).toFixed(1)} KB` : 'Plantilla por defecto'}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted">Sin plantilla cargada</div>
                    )}
                  </div>
                  <input
                    ref={templateInputRef}
                    type="file"
                    accept=".xlsm,.xlsx"
                    onChange={(e) => processTemplateFile(e.target.files?.[0])}
                    style={{ display: 'none' }}
                  />
                  <button className="btn btn-secondary btn-sm" onClick={() => templateInputRef.current?.click()}>
                    {templateBuffer ? 'Cambiar archivo' : 'Elegir archivo'}
                  </button>
                  {templateBuffer && (
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => { setTemplateBuffer(null); setTemplateName(''); setTemplateSize(null); }}
                    >
                      Quitar
                    </button>
                  )}
                </div>
                <span className="text-xs text-muted">
                  La rendición se genera rellenando esta plantilla con los comprobantes seleccionados.
                </span>
              </div>

              {/* RUT de la empresa */}
              <div className="form-group">
                <label className="form-label">RUT de la empresa (asocia el mapping)</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    placeholder="12.345.678-9"
                    value={rutEmpresa}
                    onChange={(e) => setRutEmpresa(e.target.value)}
                    onBlur={() => setRutEmpresa(formatRut(rutEmpresa))}
                    className="form-input text-mono"
                    style={{ flex: 1, minWidth: 150 }}
                  />
                  {distinctInvoicesRuts.length > 0 && (
                    <select
                      onChange={(e) => e.target.value && setRutEmpresa(e.target.value)}
                      value=""
                      className="form-select"
                      style={{ width: 'auto' }}
                      aria-label="Sugerencias de RUT"
                    >
                      <option value="">Sugerir…</option>
                      {distinctInvoicesRuts.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
                {rutEmpresa && !validateRut(rutEmpresa) && (
                  <span className="form-error">RUT de empresa inválido</span>
                )}
              </div>

              {/* Mapping de columnas */}
              <div className="mapping-grid-header" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', borderTop: '1px solid var(--color-border)', paddingTop: '15px' }}>
                <div className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Campo de la app</div>
                <div className="text-xs font-semibold" style={{ color: 'var(--color-text-secondary)' }}>Columna Excel y vista previa</div>
              </div>

              <div className="space-y-3">
                {Object.keys(DEFAULT_MAPPING).map((fieldKey) => (
                  <div key={fieldKey} className="mapping-grid-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', alignItems: 'center' }}>
                    <span className="text-sm">{MAPPING_LABELS[fieldKey]}</span>
                    <div className="flex gap-2 items-center">
                      <input
                        type="text"
                        maxLength={2}
                        value={mapping[fieldKey] || ''}
                        onChange={(e) => setMapping(prev => ({ ...prev, [fieldKey]: e.target.value.toUpperCase() }))}
                        className="form-input text-center text-mono font-bold"
                        style={{ width: '56px' }}
                        placeholder="A"
                        aria-label={`Columna para ${MAPPING_LABELS[fieldKey]}`}
                      />
                      <span className="text-xs text-muted truncate" style={{ maxWidth: '170px' }} title={getCellPreview(fieldKey)}>
                        {getCellPreview(fieldKey)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowTemplateModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleSaveMapping}>Guardar configuración</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: corrección de un comprobante con datos incompletos */}
      {editingInvoice && (
        <div className="modal-overlay" onClick={() => setEditingInvoice(null)}>
          <div ref={editModalRef} className="modal" style={{ maxWidth: '700px', width: '90%' }} role="dialog" aria-modal="true" aria-label="Corregir comprobante" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEditingInvoice}>
              <div className="modal-header">
                <h3 className="modal-title">Corregir comprobante</h3>
                <button type="button" className="modal-close" onClick={() => setEditingInvoice(null)} aria-label="Cerrar">
                  <Icon name="x" size={18} />
                </button>
              </div>

              <div className="modal-body form-grid space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <div className="form-group">
                  <label className="form-label">Nombre Proveedor</label>
                  <input
                    className="form-input"
                    value={editingInvoice.providerName || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, providerName: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">RUT Proveedor</label>
                  <input
                    className="form-input text-mono"
                    value={editingInvoice.providerRut || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, providerRut: e.target.value }))}
                    onBlur={() => setEditingInvoice(prev => ({ ...prev, providerRut: formatRut(prev.providerRut) }))}
                    required
                  />
                  {editingInvoice.providerRut && !validateRut(editingInvoice.providerRut) && (
                    <span className="form-error">RUT inválido</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo Documento</label>
                  <select
                    className="form-select"
                    value={editingInvoice.documentType || 'Boleta'}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, documentType: e.target.value }))}
                  >
                    {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">N° Documento</label>
                  <input
                    className="form-input text-mono"
                    value={editingInvoice.documentNumber || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, documentNumber: e.target.value }))}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input
                    type="date"
                    className="form-input text-mono"
                    value={editingInvoice.date || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, date: e.target.value }))}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo Gasto</label>
                  <select
                    className="form-select"
                    value={editingInvoice.expenseType || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, expenseType: e.target.value }))}
                    required
                  >
                    <option value="" disabled>Seleccione...</option>
                    {EXPENSE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group form-full">
                  <label className="form-label">Detalle</label>
                  <input
                    className="form-input"
                    value={editingInvoice.detail || ''}
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, detail: e.target.value }))}
                  />
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }} className="form-full">
                  <div className="form-group">
                    <label className="form-label">Monto Neto</label>
                    <input
                      type="number"
                      className="form-input text-mono"
                      value={editingInvoice.netAmount ?? 0}
                      onChange={(e) => {
                        const net = Number(e.target.value) || 0;
                        setEditingInvoice(prev => {
                          const iva = Number(prev.ivaAmount) || 0;
                          return { ...prev, netAmount: net, totalAmount: net + iva };
                        });
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monto IVA</label>
                    <input
                      type="number"
                      className="form-input text-mono"
                      value={editingInvoice.ivaAmount ?? 0}
                      onChange={(e) => {
                        const iva = Number(e.target.value) || 0;
                        setEditingInvoice(prev => {
                          const net = Number(prev.netAmount) || 0;
                          return { ...prev, ivaAmount: iva, totalAmount: net + iva };
                        });
                      }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Documento</label>
                    <input
                      type="number"
                      className="form-input text-mono"
                      value={editingInvoice.totalAmount ?? 0}
                      onChange={(e) => setEditingInvoice(prev => ({ ...prev, totalAmount: Number(e.target.value) || 0 }))}
                      style={{ fontWeight: 'bold' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingInvoice(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary">Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmExport && (
        <ConfirmDialog
          title="Exportar con advertencias"
          message={
            `${selectedIssuesCount} comprobante(s) seleccionados tienen datos incompletos.\n\n` +
            '¿Quieres exportar de todas formas? Puedes corregirlos primero desde el ícono de advertencia de cada fila.'
          }
          confirmLabel="Exportar igualmente"
          onConfirm={() => {
            setConfirmExport(false);
            doExportRendicion();
          }}
          onCancel={() => setConfirmExport(false)}
        />
      )}
    </div>
  );
}
