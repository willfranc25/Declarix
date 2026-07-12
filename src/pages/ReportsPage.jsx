import logger from '../utils/logger';
import { useState, useMemo, useRef, useEffect } from 'react';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getMonthName } from '../utils/formatters';
import { generateMonthlySummary, generateCategorySummary } from '../utils/calculations';
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

export default function ReportsPage() {
  const invoices = useInvoiceStore((state) => state.invoices);
  const updateInvoice = useInvoiceStore((state) => state.updateInvoice);
  
  const templateInputRef = useRef(null);

  // Filter States
  const [filterText, setFilterText] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expenseType, setExpenseType] = useState('');
  const [documentType, setDocumentType] = useState('');

  const [templateBuffer, setTemplateBuffer] = useState(null);
  const [templateName, setTemplateName] = useState('Cargando plantilla predeterminada...');
  const [templateSize, setTemplateSize] = useState(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // States para Mapping Modal
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [rutEmpresa, setRutEmpresa] = useState('');
  const [mapping, setMapping] = useState(DEFAULT_MAPPING);

  // States para Corrección Inline
  const [editingInvoice, setEditingInvoice] = useState(null);

  // Confirmación de exportación con advertencias pendientes
  const [confirmExport, setConfirmExport] = useState(false);

  const { addToast } = useToast();
  const mappingModalRef = useRef(null);
  const editModalRef = useRef(null);
  useDialogBehavior(mappingModalRef, () => setShowMappingModal(false), showMappingModal);
  useDialogBehavior(editModalRef, () => setEditingInvoice(null), Boolean(editingInvoice));

  // Lista de RUTs de empresas emisoras o proveedoras para sugerir mapping
  const distinctInvoicesRuts = useMemo(() => {
    const ruts = new Set();
    invoices.forEach(inv => {
      if (inv.providerRut) ruts.add(formatRut(inv.providerRut));
    });
    return Array.from(ruts);
  }, [invoices]);

  // Al abrir el modal de mapping, inicializar rutEmpresa si está vacío
  useEffect(() => {
    if (showMappingModal && !rutEmpresa) {
      if (distinctInvoicesRuts.length > 0) {
        setRutEmpresa(distinctInvoicesRuts[0]);
      } else {
        setRutEmpresa('12345678-9');
      }
    }
  }, [showMappingModal, rutEmpresa, distinctInvoicesRuts]);

  // Cargar mapping de la empresa activa desde el almacenamiento local
  useEffect(() => {
    async function loadMapping() {
      if (!rutEmpresa) return;
      try {
        const storage = getStorageProvider();
        const rutClean = cleanRut(rutEmpresa);
        // Fallback al prefijo legacy de versiones anteriores
        const saved = (await storage.getSetting(`export_mapping_${rutClean}`))
          || (await storage.getSetting(`saludent_mapping_${rutClean}`));
        if (saved) {
          setMapping(saved);
        } else {
          setMapping(DEFAULT_MAPPING);
        }
      } catch (err) {
        logger.error('Error al cargar mapping:', err);
      }
    }
    loadMapping();
  }, [rutEmpresa]);

  // Guardar configuración del mapping
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
      addToast(`Mapping guardado para la empresa RUT ${formatRut(rutEmpresa)}.`, 'success');
      setShowMappingModal(false);
    } catch (err) {
      addToast('Error al guardar el mapping: ' + err.message, 'error');
    }
  };

  // Cargar plantilla por defecto al iniciar
  useEffect(() => {
    const loadDefaultTemplate = async () => {
      try {
        const response = await fetch('/template.xlsm');
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          setTemplateBuffer(buffer);
          setTemplateName('template.xlsm');
          setTemplateSize(buffer.byteLength);
        } else {
          setTemplateName(''); 
          setTemplateSize(null);
        }
      } catch (error) {
        logger.error('Error cargando plantilla por defecto:', error);
        setTemplateName('');
        setTemplateSize(null);
      } finally {
        setIsLoadingTemplate(false);
      }
    };
    loadDefaultTemplate();
  }, []);

  // Procesar archivo de plantilla subido
  const processTemplateFile = (file) => {
    if (!file) return;
    setTemplateName(file.name);
    setTemplateSize(file.size);
    const reader = new FileReader();
    reader.onload = (ev) => setTemplateBuffer(ev.target.result);
    reader.readAsArrayBuffer(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processTemplateFile(file);
    }
  };

  // Filtrar comprobantes por los criterios avanzados
  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      // 1. Filtro de Texto (Proveedor, RUT o Detalle)
      if (filterText) {
        const term = filterText.toLowerCase();
        const matchesText = 
          (inv.providerName && inv.providerName.toLowerCase().includes(term)) ||
          (inv.providerRut && inv.providerRut.toLowerCase().includes(term)) ||
          (inv.detail && inv.detail.toLowerCase().includes(term));
        if (!matchesText) return false;
      }

      // 2. Filtro de Rango de Fechas
      if (dateFrom && inv.date < dateFrom) return false;
      if (dateTo && inv.date > dateTo) return false;

      // 3. Filtro por Tipo de Gasto
      if (expenseType && inv.expenseType !== expenseType) return false;

      // 4. Filtro por Tipo de Documento
      if (documentType && inv.documentType !== documentType) return false;

      return true;
    });
  }, [invoices, filterText, dateFrom, dateTo, expenseType, documentType]);

  // Validación Pre-export
  const preExportIssues = useMemo(() => {
    const issues = [];
    filtered.forEach((inv) => {
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

      if (invErrors.length > 0) {
        issues.push({
          id: inv.id,
          invoice: inv,
          errors: invErrors
        });
      }
    });
    return issues;
  }, [filtered]);

  // Conteo resumen de problemas pre-export
  const preExportSummaryText = useMemo(() => {
    let missingRuts = 0;
    let invalidDates = 0;
    let zeroTotals = 0;

    preExportIssues.forEach(issue => {
      if (issue.errors.some(e => e.includes('RUT'))) missingRuts++;
      if (issue.errors.some(e => e.includes('fecha') || e.includes('Fecha'))) invalidDates++;
      if (issue.errors.some(e => e.includes('cero'))) zeroTotals++;
    });

    const parts = [];
    if (missingRuts > 0) parts.push(`Faltan ${missingRuts} RUTs`);
    if (invalidDates > 0) parts.push(`${invalidDates} fechas inválidas`);
    if (zeroTotals > 0) parts.push(`${zeroTotals} total=0`);

    return parts.length > 0 ? parts.join(', ') : 'Ninguno';
  }, [preExportIssues]);

  // Export handlers
  const doExportRendicion = async () => {
    try {
      const activeMapping = rutEmpresa ? mapping : null;
      const data = await exportToRendicion(filtered, templateBuffer, {
        fechaRendicion: formatDate(new Date().toISOString().split('T')[0]),
        rut: rutEmpresa || ''
      }, activeMapping);

      const filename = `Rendicion-${new Date().toISOString().split('T')[0]}.xlsx`;
      const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      downloadFile(data, filename, mimeType);
      addToast(`Rendición exportada: ${filename}`, 'success');
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const handleExportRendicion = () => {
    if (!templateBuffer) {
      addToast('Primero carga la plantilla Excel (.xlsm o .xlsx).', 'warning');
      return;
    }
    if (preExportIssues.length > 0) {
      setConfirmExport(true);
      return;
    }
    doExportRendicion();
  };

  const handleExportExcel = async () => {
    try {
      const data = await exportToExcel(filtered, { includeMonthlySheet: true, includeCategorySheet: true });
      downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    }
  };

  const handleExportCSV = () => {
    const data = exportToCSV(filtered);
    downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  };

  // Preview dinámico de celda en modal de Mapping
  const getCellPreview = (fieldKey) => {
    const col = mapping[fieldKey] || '';
    if (!col) return '(Ignorado)';
    const firstVal = filtered[0] ? filtered[0][fieldKey] : null;
    return `Columna ${col.toUpperCase()}21: "${firstVal !== null && firstVal !== undefined ? firstVal : '—'}"`;
  };

  // Guardar edición del comprobante corregido inline
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

  const monthly = useMemo(() => generateMonthlySummary(filtered), [filtered]);
  const category = useMemo(() => generateCategorySummary(filtered), [filtered]);

  const totals = useMemo(() => filtered.reduce((acc, inv) => ({
    count: acc.count + 1,
    netAmount: acc.netAmount + (inv.netAmount || 0),
    ivaAmount: acc.ivaAmount + (inv.ivaAmount || 0),
    specificTax: acc.specificTax + (inv.specificTax || 0),
    totalAmount: acc.totalAmount + (inv.totalAmount || 0),
  }), { count: 0, netAmount: 0, ivaAmount: 0, specificTax: 0, totalAmount: 0 }), [filtered]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Estilos locales para responsividad de exportación, mapping y touch targets */}
      <style>{`
        @media (max-width: 768px) {
          .export-actions {
            flex-direction: column !important;
            align-items: stretch !important;
            width: 100% !important;
          }
          .export-actions .btn {
            width: 100% !important;
            min-height: 44px !important;
            display: flex !important;
            justify-content: center !important;
            align-items: center !important;
          }
          .mapping-grid-header {
            display: none !important;
          }
          .mapping-grid-row {
            grid-template-columns: 1fr !important;
            gap: 8px !important;
            align-items: flex-start !important;
            border-bottom: 1px solid var(--color-border) !important;
            padding-bottom: 12px !important;
            margin-bottom: 12px !important;
          }
          .mapping-grid-row input {
            width: 100% !important;
            max-width: unset !important;
            min-height: 44px !important;
          }
          .mapping-grid-row .flex {
            width: 100% !important;
          }
          .form-group input, 
          .form-group select, 
          .form-group button {
            min-height: 44px !important;
          }
          .modal-actions .btn {
            min-height: 44px !important;
          }
        }

        .mapping-modal-dialog {
          max-width: 600px;
          width: 90%;
        }
        @media (max-width: 768px) {
          .mapping-modal-dialog {
            max-width: 100%;
            width: 100%;
          }
        }
      `}</style>

      <div className="page-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">Resumen de gastos y exportación de datos</p>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-secondary" style={{ minHeight: '44px' }} onClick={() => setShowMappingModal(true)}>
            <Icon name="settings" /> Configurar mapping
          </button>
        </div>
      </div>

      {/* Filtros Avanzados */}
      <div className="card">
        <h3 className="card-title mb-4 flex justify-between items-center flex-wrap gap-2">
          <span><Icon name="search" />Filtros de búsqueda</span>
          {(filterText || dateFrom || dateTo || expenseType || documentType) && (
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => {
                setFilterText('');
                setDateFrom('');
                setDateTo('');
                setExpenseType('');
                setDocumentType('');
              }}
            >
              Limpiar filtros <Icon name="x" size={14} />
            </button>
          )}
        </h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
          {/* Búsqueda por Texto */}
          <div className="form-group" style={{ gridColumn: '1 / -1' }}>
            <label className="form-label">Buscar Proveedor, RUT o Detalle</label>
            <input 
              className="form-input" 
              type="text" 
              placeholder="Ej. Sodimac, 76.123.456-7..."
              value={filterText} 
              onChange={(e) => setFilterText(e.target.value)} 
            />
          </div>

          {/* Rango de Fechas */}
          <div className="form-group">
            <label className="form-label">Desde Fecha</label>
            <input 
              className="form-input" 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
            />
          </div>
          <div className="form-group">
            <label className="form-label">Hasta Fecha</label>
            <input 
              className="form-input" 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
            />
          </div>

          {/* Tipo de Documento */}
          <div className="form-group">
            <label className="form-label">Tipo de Documento</label>
            <select 
              className="form-input"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
            >
              <option value="">Todos los documentos</option>
              {DOCUMENT_TYPES.map(doc => (
                <option key={doc} value={doc}>{doc}</option>
              ))}
            </select>
          </div>

          {/* Tipo de Gasto */}
          <div className="form-group">
            <label className="form-label">Categoría de Gasto</label>
            <select 
              className="form-input"
              value={expenseType}
              onChange={(e) => setExpenseType(e.target.value)}
            >
              <option value="">Todas las categorías</option>
              {EXPENSE_TYPES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Pre-export Validation Panel */}
      {preExportIssues.length > 0 && (
        <div className="card" style={{ borderColor: 'var(--color-danger-border)' }}>
          <h3 className="card-title text-red-400 mb-2">
            <Icon name="alert" style={{ color: 'var(--color-danger)' }} /> Advertencias pre-exportación ({preExportIssues.length})
          </h3>
          <p className="text-xs text-slate-400 mb-4">
            Resumen de problemas: <strong className="text-red-400">{preExportSummaryText}</strong>. Haz clic en cualquier fila para corregir de inmediato.
          </p>

          <div style={{ maxHeight: '180px', overflowY: 'auto' }} className="space-y-2 pr-2">
            {preExportIssues.map((issue) => (
              <div 
                key={issue.id} 
                onClick={() => setEditingInvoice(issue.invoice)}
                style={{ 
                  background: 'rgba(239, 68, 68, 0.05)', 
                  border: '1px solid rgba(239, 68, 68, 0.15)',
                  borderRadius: '6px',
                  padding: '8px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'between',
                  alignItems: 'center',
                  fontSize: '0.8rem',
                  transition: 'background 0.2s',
                  minHeight: '44px'
                }}
                className="hover:bg-red-500/10"
              >
                <div style={{ flex: 1 }}>
                  <strong>{issue.invoice.providerName || 'Sin Nombre'}</strong> (N° {issue.invoice.documentNumber || 'S/N'} — {formatDate(issue.invoice.date)})
                  <div style={{ display: 'flex', gap: '8px', marginTop: '2px', color: 'var(--color-danger)', fontSize: '0.75rem' }}>
                    {issue.errors.map((err, i) => <span key={i}>• {err}</span>)}
                  </div>
                </div>
                <span style={{ fontSize: '0.75rem', textDecoration: 'underline', color: 'var(--color-accent-light)' }}>Corregir</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grand Totals */}
      <div className="card">
        <h3 className="card-title mb-4">Total Acumulado</h3>
        <div className="grid-metrics" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
          <div>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Comprobantes</p>
            <p className="font-bold" style={{ fontSize: '1.5rem', marginTop: 4 }}>{totals.count}</p>
          </div>
          <div>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Neto</p>
            <p className="font-bold" style={{ fontSize: '1.5rem', marginTop: 4 }}>{formatCurrency(totals.netAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>IVA</p>
            <p className="font-bold" style={{ fontSize: '1.5rem', marginTop: 4 }}>{formatCurrency(totals.ivaAmount)}</p>
          </div>
          <div>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Imp. Específico</p>
            <p className="font-bold" style={{ fontSize: '1.5rem', marginTop: 4 }}>{formatCurrency(totals.specificTax)}</p>
          </div>
          <div>
            <p className="text-xs text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Total</p>
            <p className="font-bold text-accent" style={{ fontSize: '1.5rem', marginTop: 4 }}>{formatCurrency(totals.totalAmount)}</p>
          </div>
        </div>
      </div>

      {/* Monthly Summary */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
          <h3 className="card-title">Resumen Mensual</h3>
        </div>
        {monthly.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Mes</th>
                  <th className="text-right">Comprobantes</th>
                  <th className="text-right">Neto</th>
                  <th className="text-right">IVA</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {monthly.map((m) => (
                  <tr key={`${m.year}-${m.month}`}>
                    <td className="font-semibold" data-label="Mes">{getMonthName(m.month)} {m.year}</td>
                    <td className="text-right" data-label="Comprobantes">{m.count}</td>
                    <td className="text-right text-mono" data-label="Neto">{formatCurrency(m.netAmount)}</td>
                    <td className="text-right text-mono" data-label="IVA">{formatCurrency(m.ivaAmount)}</td>
                    <td className="text-right text-mono font-semibold" data-label="Total">{formatCurrency(m.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-center" style={{ padding: '2rem' }}>Sin datos</p>
        )}
      </div>

      {/* Category Summary */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
          <h3 className="card-title">Resumen por Tipo de Gasto</h3>
        </div>
        {category.length > 0 ? (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Tipo de Gasto</th>
                  <th className="text-right">Comprobantes</th>
                  <th className="text-right">Neto</th>
                  <th className="text-right">IVA</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {category.map((c) => (
                  <tr key={c.category}>
                    <td className="font-semibold" data-label="Tipo Gasto">{c.category}</td>
                    <td className="text-right" data-label="Comprobantes">{c.count}</td>
                    <td className="text-right text-mono" data-label="Neto">{formatCurrency(c.netAmount)}</td>
                    <td className="text-right text-mono" data-label="IVA">{formatCurrency(c.ivaAmount)}</td>
                    <td className="text-right text-mono font-semibold" data-label="Total">{formatCurrency(c.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-muted text-center" style={{ padding: '2rem' }}>Sin datos</p>
        )}
      </div>

      {/* Export */}
      <div className="card">
        <h3 className="card-title mb-4">Exportar Datos</h3>

        {/* Template upload instruction */}
        <div className="alert alert-info mb-4">
          <Icon name="info" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <strong>Exportar a Rendición:</strong> Arrastra la plantilla Excel (.xlsm) al recuadro de abajo para cargarla. Se rellenará con los datos filtrados según el mapping.
          </div>
        </div>

        {/* Drag and drop zone with preview */}
        <div className="mb-6 space-y-4">
          <div 
            className={`dropzone ${isDragging ? 'dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => templateInputRef.current?.click()}
            style={{
              border: '2px dashed var(--color-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '30px var(--space-4)',
              textAlign: 'center',
              cursor: 'pointer',
              background: isDragging ? 'var(--color-bg-hover)' : 'var(--color-bg-secondary)',
              transition: 'all 0.2s ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              minHeight: '160px'
            }}
          >
            <input 
              ref={templateInputRef} 
              type="file" 
              accept=".xlsm,.xlsx" 
              onChange={(e) => processTemplateFile(e.target.files?.[0])} 
              style={{ display: 'none' }} 
            />
            
            {templateBuffer ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div className="empty-state-icon" style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent-light)' }}>
                  <Icon name="table" size={24} />
                </div>
                <div style={{ fontWeight: '600', color: 'var(--color-text-primary)', wordBreak: 'break-all' }}>
                  {templateName}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                  {templateSize ? `${(templateSize / 1024).toFixed(1)} KB` : 'Plantilla por defecto'} • Lista para exportar
                </div>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setTemplateBuffer(null);
                    setTemplateName('');
                    setTemplateSize(null);
                  }}
                  style={{ 
                    color: 'var(--color-danger)', 
                    marginTop: '8px',
                    minHeight: '44px',
                    display: 'inline-flex',
                    alignItems: 'center'
                  }}
                >
                  Remover plantilla
                </button>
              </div>
            ) : (
              <>
                <div className="empty-state-icon">
                  <Icon name="upload" size={24} />
                </div>
                <div>
                  <p className="font-semibold" style={{ margin: 0 }}>Arrastra la plantilla Excel aquí</p>
                  <p className="text-xs text-slate-400" style={{ margin: '4px 0 0 0' }}>O haz clic para seleccionar archivo (.xlsm, .xlsx)</p>
                </div>
              </>
            )}
          </div>

          <div className="export-actions flex gap-3 flex-wrap" style={{ width: '100%' }}>
            <button 
              className="btn btn-primary" 
              onClick={handleExportRendicion} 
              disabled={!templateBuffer}
              style={{ flex: 1, minHeight: '44px' }}
            >
              <Icon name="table" /> Exportar a rendición
            </button>
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
          <p className="text-sm text-muted mb-4">Exportaciones simples:</p>
          <div className="export-actions flex gap-3 flex-wrap" style={{ width: '100%' }}>
            <button className="btn btn-secondary" style={{ flex: 1, minHeight: '44px' }} onClick={handleExportExcel}><Icon name="download" /> Excel simple</button>
            <button className="btn btn-secondary" style={{ flex: 1, minHeight: '44px' }} onClick={handleExportCSV}><Icon name="document" /> CSV</button>
          </div>
        </div>
      </div>

      {/* Configurar Mapping Modal (Bottom Sheet on Mobile) */}
      {showMappingModal && (
        <div className="modal-overlay" onClick={() => setShowMappingModal(false)}>
          <div ref={mappingModalRef} className="modal mapping-modal-dialog" role="dialog" aria-modal="true" aria-label="Configurar mapping de columnas Excel" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Configurar mapping de columnas Excel</h3>
              <button 
                className="modal-close" 
                onClick={() => setShowMappingModal(false)}
                style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="x" size={18} />
              </button>
            </div>
            
            <div className="modal-body space-y-4" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div className="alert alert-info text-xs">
                <Icon name="info" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  Configura a qué letra de columna Excel (A, B, C...) corresponde cada campo en la hoja "base" de la plantilla. Se guarda de forma independiente para cada empresa.
                </div>
              </div>

              {/* Selector de Empresa */}
              <div className="form-group">
                <label className="form-label">RUT Empresa (Asociar Mapping)</label>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  <input 
                    type="text" 
                    placeholder="12.345.678-9" 
                    value={rutEmpresa} 
                    onChange={(e) => setRutEmpresa(e.target.value)} 
                    onBlur={() => setRutEmpresa(formatRut(rutEmpresa))} 
                    className="form-input"
                    style={{ flex: 1, minHeight: '44px' }}
                  />
                  {distinctInvoicesRuts.length > 0 && (
                    <select 
                      onChange={(e) => setRutEmpresa(e.target.value)} 
                      value={rutEmpresa}
                      className="form-select text-xs"
                      style={{ width: '100%', maxWidth: '100%', minHeight: '44px' }}
                    >
                      <option value="">Sugerir RUT...</option>
                      {distinctInvoicesRuts.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  )}
                </div>
                {rutEmpresa && !validateRut(rutEmpresa) && (
                  <span className="text-xs text-red-400">RUT de Empresa inválido</span>
                )}
              </div>

              {/* Dos Columnas de Campos y Letras Excel */}
              <div className="mapping-grid-header" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', borderTop: '1px solid var(--color-border)', paddingTop: '15px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Campo de la App</div>
                <div style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Columna Excel (Letra) & Vista Previa</div>
              </div>

              <div className="space-y-3" style={{ borderTop: '1px solid var(--color-border)', paddingTop: '10px' }}>
                {Object.keys(DEFAULT_MAPPING).map((fieldKey) => (
                  <div key={fieldKey} className="mapping-grid-row" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '15px', alignItems: 'center' }}>
                    <span className="text-sm font-medium">{MAPPING_LABELS[fieldKey]}</span>
                    <div className="flex gap-2 items-center">
                      <input 
                        type="text" 
                        maxLength={2} 
                        value={mapping[fieldKey] || ''} 
                        onChange={(e) => setMapping(prev => ({ ...prev, [fieldKey]: e.target.value.toUpperCase() }))} 
                        className="form-input text-center font-bold"
                        style={{ width: '60px', padding: '4px', minHeight: '44px' }}
                        placeholder="A"
                      />
                      <span className="text-xs text-slate-400 truncate" style={{ maxWidth: '160px' }} title={getCellPreview(fieldKey)}>
                        {getCellPreview(fieldKey)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" style={{ minHeight: '44px' }} onClick={() => setShowMappingModal(false)}>Cancelar</button>
              <button className="btn btn-primary" style={{ minHeight: '44px' }} onClick={handleSaveMapping}>Guardar mapping</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Corrección de Comprobante Inline */}
      {editingInvoice && (
        <div className="modal-overlay" onClick={() => setEditingInvoice(null)}>
          <div ref={editModalRef} className="modal" style={{ maxWidth: '700px', width: '90%' }} role="dialog" aria-modal="true" aria-label="Corregir comprobante" tabIndex={-1} onClick={(e) => e.stopPropagation()}>
            <form onSubmit={handleSaveEditingInvoice}>
              <div className="modal-header">
                <h3 className="modal-title">Corregir comprobante</h3>
                <button 
                  type="button" 
                  className="modal-close" 
                  onClick={() => setEditingInvoice(null)}
                  style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
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
                    style={{ minHeight: '44px' }}
                  />
                </div>
                
                <div className="form-group">
                  <label className="form-label">RUT Proveedor</label>
                  <input 
                    className="form-input" 
                    value={editingInvoice.providerRut || ''} 
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, providerRut: e.target.value }))}
                    onBlur={() => setEditingInvoice(prev => ({ ...prev, providerRut: formatRut(prev.providerRut) }))}
                    required
                    style={{ minHeight: '44px' }}
                  />
                  {editingInvoice.providerRut && !validateRut(editingInvoice.providerRut) && (
                    <span className="text-xs text-red-400">RUT inválido</span>
                  )}
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo Documento</label>
                  <select 
                    className="form-select" 
                    value={editingInvoice.documentType || 'Boleta'} 
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, documentType: e.target.value }))}
                    style={{ minHeight: '44px' }}
                  >
                    {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">N° Documento</label>
                  <input 
                    className="form-input" 
                    value={editingInvoice.documentNumber || ''} 
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, documentNumber: e.target.value }))}
                    style={{ minHeight: '44px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Fecha</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={editingInvoice.date || ''} 
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, date: e.target.value }))}
                    required
                    style={{ minHeight: '44px' }}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Tipo Gasto</label>
                  <select 
                    className="form-select" 
                    value={editingInvoice.expenseType || ''} 
                    onChange={(e) => setEditingInvoice(prev => ({ ...prev, expenseType: e.target.value }))}
                    required
                    style={{ minHeight: '44px' }}
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
                    style={{ minHeight: '44px' }}
                  />
                </div>

                {/* Montos */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }} className="form-full">
                  <div className="form-group">
                    <label className="form-label">Monto Neto</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={editingInvoice.netAmount ?? 0} 
                      onChange={(e) => {
                        const net = Number(e.target.value) || 0;
                        setEditingInvoice(prev => {
                          const iva = Number(prev.ivaAmount) || 0;
                          return { ...prev, netAmount: net, totalAmount: net + iva };
                        });
                      }}
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Monto IVA</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={editingInvoice.ivaAmount ?? 0} 
                      onChange={(e) => {
                        const iva = Number(e.target.value) || 0;
                        setEditingInvoice(prev => {
                          const net = Number(prev.netAmount) || 0;
                          return { ...prev, ivaAmount: iva, totalAmount: net + iva };
                        });
                      }}
                      style={{ minHeight: '44px' }}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Total Documento</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={editingInvoice.totalAmount ?? 0} 
                      onChange={(e) => setEditingInvoice(prev => ({ ...prev, totalAmount: Number(e.target.value) || 0 }))}
                      style={{ fontWeight: 'bold', minHeight: '44px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" style={{ minHeight: '44px' }} onClick={() => setEditingInvoice(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ minHeight: '44px' }}>Guardar cambios</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {confirmExport && (
        <ConfirmDialog
          title="Exportar con advertencias"
          message={
            `Faltan datos críticos en ${preExportIssues.length} comprobante(s): ${preExportSummaryText}.\n\n` +
            '¿Quieres exportar de todas formas? Puedes corregirlos primero desde el panel de advertencias.'
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
