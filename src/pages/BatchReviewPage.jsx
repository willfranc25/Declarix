import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { validateRut, formatRut } from '../utils/rutValidator';
import { EXPENSE_TYPES, DOCUMENT_TYPES } from '../data/expenseTypes';
import Icon from '../components/ui/Icon';

const COLUMNS = [
  { key: 'providerName', label: 'Proveedor', type: 'text' },
  { key: 'providerRut', label: 'RUT', type: 'text' },
  { key: 'documentType', label: 'Tipo Doc', type: 'select', options: DOCUMENT_TYPES },
  { key: 'documentNumber', label: 'N° Doc', type: 'text' },
  { key: 'date', label: 'Fecha', type: 'date' },
  { key: 'expenseType', label: 'Tipo Gasto', type: 'select', options: EXPENSE_TYPES },
  { key: 'netAmount', label: 'Neto', type: 'number' },
  { key: 'ivaAmount', label: 'IVA', type: 'number' },
  { key: 'totalAmount', label: 'Total', type: 'number' },
  { key: 'taxStatus', label: 'Estado Trib.', type: 'select', options: ['pending', 'reviewed', 'declared'] }
];

const TAX_STATUS_LABELS = {
  pending: 'Pendiente',
  reviewed: 'Revisado',
  declared: 'Declarado'
};

export default function BatchReviewPage() {
  const navigate = useNavigate();
  const { batchInvoices, addInvoice, setBatchInvoices } = useInvoiceStore();

  const [rows, setRows] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeRowId, setActiveRowId] = useState(null);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  // Guardar valor original para "Escape to cancel"
  const editingCellRef = useRef(null);

  // Cargar comprobantes de lote desde el store
  useEffect(() => {
    if (batchInvoices && batchInvoices.length > 0) {
      setRows(batchInvoices);
      setActiveRowId(batchInvoices[0].id);
    } else {
      setRows([]);
    }
  }, [batchInvoices]);

  // Actualizar la vista previa de la imagen para el renglón activo
  useEffect(() => {
    if (!activeRowId) {
      setPreviewImageUrl(null);
      return;
    }
    const activeRow = rows.find(r => r.id === activeRowId);
    if (activeRow && activeRow.file) {
      const url = URL.createObjectURL(activeRow.file);
      setPreviewImageUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewImageUrl(null);
    }
  }, [activeRowId, rows]);

  // Validador en tiempo real por fila
  const getRowErrors = (row) => {
    const errors = {};
    if (!row.providerRut) {
      errors.providerRut = 'Falta RUT';
    } else if (!validateRut(row.providerRut)) {
      errors.providerRut = 'RUT inválido';
    }

    const isInvoiceOrNC = ['Factura', 'Factura Electrónica', 'Nota de Crédito'].includes(row.documentType);
    if (isInvoiceOrNC) {
      const net = Number(row.netAmount) || 0;
      const iva = Number(row.ivaAmount) || 0;
      const total = Number(row.totalAmount) || 0;
      if (Math.abs(net + iva - total) > 2) {
        errors.amounts = 'Neto + IVA ≠ Total';
      }
    }

    if (['Boleta', 'Boleta Electrónica'].includes(row.documentType)) {
      if ((Number(row.totalBoletaServicios) || 0) <= 0 && (Number(row.totalAmount) || 0) <= 0) {
        errors.totalBoletaServicios = 'Total debe ser > 0';
      }
    }

    if (row.documentType === 'Boleta de Honorarios') {
      if ((Number(row.totalBoletaHonorarios) || 0) <= 0 && (Number(row.totalAmount) || 0) <= 0) {
        errors.totalBoletaHonorarios = 'Honorarios debe ser > 0';
      }
    }

    if (!row.date) {
      errors.date = 'Falta fecha';
    } else {
      const d = new Date(row.date + 'T00:00:00');
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (isNaN(d.getTime())) {
        errors.date = 'Fecha inválida';
      } else if (d > today) {
        errors.date = 'Fecha futura';
      }
    }

    if (!row.expenseType) {
      errors.expenseType = 'Falta tipo gasto';
    }

    return errors;
  };

  // Manejar el cambio de valor en una celda
  const handleCellChange = (rowId, key, value) => {
    setRows(prev => prev.map(row => {
      if (row.id !== rowId) return row;

      const updated = { ...row, [key]: value };

      // Si cambia Neto o IVA, recalcular Total para Facturas/NC automáticamente
      const isInvoiceOrNC = ['Factura', 'Factura Electrónica', 'Nota de Crédito'].includes(updated.documentType);
      if (isInvoiceOrNC && (key === 'netAmount' || key === 'ivaAmount')) {
        updated.totalAmount = (Number(updated.netAmount) || 0) + (Number(updated.ivaAmount) || 0);
      }

      return updated;
    }));
  };

  // Cambio de taxStatus masivo (Bulk Change)
  const handleBulkTaxStatusChange = (status) => {
    if (selectedIds.length === 0) return;
    setRows(prev => prev.map(row => {
      if (selectedIds.includes(row.id)) {
        return { ...row, taxStatus: status };
      }
      return row;
    }));
  };

  // Navegación por teclado (Tab, Shift+Tab, Flechas, Enter, Escape)
  const focusCell = (rowIndex, colKey) => {
    const selector = `[data-row="${rowIndex}"][data-col="${colKey}"]`;
    const element = document.querySelector(selector);
    if (element) {
      element.focus();
      if (element.select) element.select();
    }
  };

  const handleKeyDown = (e, rowIndex, colIndex) => {
    const colKey = COLUMNS[colIndex].key;
    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (rowIndex < rows.length - 1) {
        focusCell(rowIndex + 1, colKey);
        setActiveRowId(rows[rowIndex + 1].id);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIndex > 0) {
        focusCell(rowIndex - 1, colKey);
        setActiveRowId(rows[rowIndex - 1].id);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab: mover a la izquierda
        if (colIndex > 0) {
          focusCell(rowIndex, COLUMNS[colIndex - 1].key);
        } else if (rowIndex > 0) {
          // Mover a la última celda de la fila anterior
          focusCell(rowIndex - 1, COLUMNS[COLUMNS.length - 1].key);
          setActiveRowId(rows[rowIndex - 1].id);
        }
      } else {
        // Tab: mover a la derecha
        if (colIndex < COLUMNS.length - 1) {
          focusCell(rowIndex, COLUMNS[colIndex + 1].key);
        } else if (rowIndex < rows.length - 1) {
          // Mover a la primera celda de la fila siguiente
          focusCell(rowIndex + 1, COLUMNS[0].key);
          setActiveRowId(rows[rowIndex + 1].id);
        }
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (editingCellRef.current && editingCellRef.current.rowId === rows[rowIndex].id && editingCellRef.current.key === colKey) {
        handleCellChange(rows[rowIndex].id, colKey, editingCellRef.current.value);
      }
      e.target.blur();
    }
  };

  // Checkbox: Seleccionar individual
  const handleSelectRow = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Checkbox: Seleccionar todos
  const handleSelectAll = () => {
    if (selectedIds.length === rows.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(rows.map(r => r.id));
    }
  };

  // Guardar seleccionados
  const handleSaveSelected = async () => {
    if (isSaving) return;
    const selectedRows = rows.filter(r => selectedIds.includes(r.id));
    if (selectedRows.length === 0) return;

    // Verificar si hay errores en las filas seleccionadas
    const hasErrors = selectedRows.some(r => Object.keys(getRowErrors(r)).length > 0);
    if (hasErrors) {
      if (!window.confirm('Algunos de los registros seleccionados tienen errores. ¿Deseas guardarlos de todas formas?')) {
        return;
      }
    }

    setIsSaving(true);
    let successCount = 0;
    const remaining = [];

    for (const row of rows) {
      if (selectedIds.includes(row.id)) {
        try {
          const { id, file, ...invoiceData } = row;
          // Normalizar montos
          const cleanData = {
            ...invoiceData,
            netAmount: Number(invoiceData.netAmount) || 0,
            ivaAmount: Number(invoiceData.ivaAmount) || 0,
            totalAmount: Number(invoiceData.totalAmount) || 0,
            totalBoletaServicios: Number(invoiceData.totalBoletaServicios) || 0,
            totalBoletaHonorarios: Number(invoiceData.totalBoletaHonorarios) || 0,
            specificTax: Number(invoiceData.specificTax) || 0,
          };
          await addInvoice(cleanData, file);
          successCount++;
        } catch (err) {
          console.error('Error al guardar fila:', row, err);
          remaining.push(row);
        }
      } else {
        remaining.push(row);
      }
    }

    setRows(remaining);
    setBatchInvoices(remaining);
    setSelectedIds([]);
    setIsSaving(false);
    alert(`Se guardaron ${successCount} comprobantes.`);

    if (remaining.length === 0) {
      navigate('/invoices');
    }
  };

  // Guardar todos
  const handleSaveAll = async () => {
    if (isSaving) return;
    if (rows.length === 0) return;

    // Verificar si hay errores
    const hasErrors = rows.some(r => Object.keys(getRowErrors(r)).length > 0);
    if (hasErrors) {
      if (!window.confirm('Algunos registros en la lista contienen errores. ¿Deseas guardarlos de todas formas?')) {
        return;
      }
    }

    setIsSaving(true);
    let successCount = 0;
    const remaining = [];

    for (const row of rows) {
      try {
        const { id, file, ...invoiceData } = row;
        const cleanData = {
          ...invoiceData,
          netAmount: Number(invoiceData.netAmount) || 0,
          ivaAmount: Number(invoiceData.ivaAmount) || 0,
          totalAmount: Number(invoiceData.totalAmount) || 0,
          totalBoletaServicios: Number(invoiceData.totalBoletaServicios) || 0,
          totalBoletaHonorarios: Number(invoiceData.totalBoletaHonorarios) || 0,
          specificTax: Number(invoiceData.specificTax) || 0,
        };
        await addInvoice(cleanData, file);
        successCount++;
      } catch (err) {
        console.error('Error al guardar fila:', row, err);
        remaining.push(row);
      }
    }

    setRows(remaining);
    setBatchInvoices(remaining);
    setSelectedIds([]);
    setIsSaving(false);
    alert(`Se guardaron ${successCount} comprobantes.`);

    if (remaining.length === 0) {
      navigate('/invoices');
    }
  };

  // Descartar seleccionados (Bulk Delete)
  const handleDiscardSelected = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`¿Estás seguro de que deseas descartar las ${selectedIds.length} filas seleccionadas?`)) {
      const remaining = rows.filter(r => !selectedIds.includes(r.id));
      setRows(remaining);
      setBatchInvoices(remaining);
      setSelectedIds([]);
      if (remaining.length > 0) {
        setActiveRowId(remaining[0].id);
      } else {
        setActiveRowId(null);
      }
    }
  };

  // Volver a UploadPage si no hay datos (Empty State)
  if (rows.length === 0) {
    return (
      <div className="space-y-6 text-center py-12 animate-fade-in">
        <div className="card max-w-md mx-auto p-8 space-y-6">
          <div className="empty-state-icon">
            <Icon name="archive" size={24} />
          </div>
          <h2 className="text-xl font-bold">No hay comprobantes cargados en lote</h2>
          <p className="text-slate-400 text-sm">
            Para revisar comprobantes en lote, primero debes subir imágenes en la pantalla de Carga Masiva.
          </p>
          <button className="btn btn-primary w-full" style={{ minHeight: '44px' }} onClick={() => navigate('/upload')}>
            Ir a Carga Masiva
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" style={{ width: '100%' }}>
      {/* Estilos locales para sticky headers y responsividad */}
      <style>{`
        /* Desktop sticky table header y scrolling vertical dentro de la card */
        @media (min-width: 769px) {
          .spreadsheet-container {
            max-height: 65vh;
            overflow-y: auto;
            position: relative;
          }
          .spreadsheet-table th {
            position: sticky;
            top: 0;
            z-index: 10;
            background: var(--color-bg-secondary);
            border-bottom: 2px solid var(--color-border) !important;
          }
        }

        /* Ajustes mobile */
        @media (max-width: 768px) {
          .batch-grid {
            grid-template-columns: 1fr !important;
          }
          .document-viewer-card {
            position: static !important;
            margin-top: 16px;
          }
          .spreadsheet-table td {
            border-bottom: 1px solid var(--color-border-subtle) !important;
            padding: 10px 0 !important;
            min-height: 48px;
          }
          .spreadsheet-table td input, 
          .spreadsheet-table td select {
            text-align: right;
            width: auto !important;
            max-width: 180px;
            min-height: 44px;
            padding: 8px 12px !important;
            border: 1px solid var(--color-border) !important;
            border-radius: var(--radius-md) !important;
            background: var(--color-bg-primary) !important;
          }
          .spreadsheet-table td input[type="checkbox"] {
            width: 24px !important;
            height: 24px !important;
            min-height: unset !important;
            cursor: pointer;
          }
          .bulk-actions-container {
            flex-direction: column;
            align-items: stretch !important;
            gap: 10px !important;
          }
          .bulk-actions-container .btn,
          .bulk-actions-container select {
            width: 100% !important;
            min-height: 44px;
          }
        }
      `}</style>

      <div className="page-header flex justify-between items-center flex-wrap gap-4">
        <div>
          <h1 className="page-title">Revisión en Lote</h1>
          <p className="page-subtitle">Modifica directamente los datos extraídos por la IA en formato planilla Excel.</p>
        </div>
        
        {/* Acciones de Lote */}
        <div className="flex gap-3 flex-wrap bulk-actions-container">
          <button 
            className="btn btn-secondary" 
            onClick={handleSelectAll}
            style={{ minHeight: '44px' }}
          >
            {selectedIds.length === rows.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
          </button>
          
          <select 
            className="spreadsheet-select"
            value=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkTaxStatusChange(e.target.value);
                e.target.value = ""; 
              }
            }}
            disabled={selectedIds.length === 0}
            style={{ 
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-bg-secondary)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              fontSize: '0.85rem',
              cursor: 'pointer',
              minHeight: '44px'
            }}
          >
            <option value="" disabled>Cambiar Estado Trib. (Lote)...</option>
            <option value="pending">Pendiente</option>
            <option value="reviewed">Revisado</option>
            <option value="declared">Declarado</option>
          </select>

          <button 
            className="btn btn-secondary" 
            onClick={handleDiscardSelected} 
            disabled={selectedIds.length === 0 || isSaving}
            style={{ borderColor: 'var(--color-danger)', color: 'var(--color-danger)', minHeight: '44px' }}
          >
            <Icon name="trash" /> Descartar ({selectedIds.length})
          </button>
          <button 
            className="btn btn-secondary" 
            onClick={handleSaveSelected} 
            disabled={selectedIds.length === 0 || isSaving}
            style={{ minHeight: '44px' }}
          >
            Guardar seleccionados ({selectedIds.length})
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSaveAll} 
            disabled={isSaving}
            style={{ minHeight: '44px' }}
          >
            Guardar todos ({rows.length})
          </button>
        </div>
      </div>

      {/* Grid Contenedor: Tabla a la Izquierda, Visor de Documento a la Derecha */}
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--grid-cols, 1fr 340px)', gap: '20px', alignItems: 'start' }} className="batch-grid">
        
        {/* Tabla Spreadsheet */}
        <div className="card spreadsheet-container p-0" style={{ minWidth: 0 }}>
          <table className="table spreadsheet-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '10px', width: '40px', textAlign: 'center' }}>
                  <input 
                    type="checkbox" 
                    checked={selectedIds.length === rows.length} 
                    onChange={handleSelectAll} 
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ padding: '10px', width: '30px', textAlign: 'center' }}>#</th>
                {COLUMNS.map(col => (
                  <th key={col.key} style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: 'var(--color-text-secondary)' }}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => {
                const errors = getRowErrors(row);
                const hasRowErrors = Object.keys(errors).length > 0;
                const isActive = row.id === activeRowId;

                return (
                  <tr 
                    key={row.id} 
                    onClick={() => setActiveRowId(row.id)}
                    style={{ 
                      borderBottom: '1px solid var(--color-border)', 
                      background: isActive ? 'var(--color-bg-hover)' : 'transparent',
                      transition: 'background 0.2s'
                    }}
                  >
                    {/* Checkbox */}
                    <td data-label="Seleccionar" style={{ padding: '6px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                      <input 
                        type="checkbox" 
                        checked={selectedIds.includes(row.id)} 
                        onChange={() => handleSelectRow(row.id)} 
                      />
                    </td>

                    {/* Fila Numérica / Indicador Error */}
                    <td data-label="Estado" style={{ padding: '6px', textAlign: 'center', fontWeight: 'bold' }}>
                      {hasRowErrors ? (
                        <span 
                          title={Object.values(errors).join(', ')} 
                          style={{ color: 'var(--color-danger)', cursor: 'help' }}
                        >
                          <Icon name="alert" size={14} />
                        </span>
                      ) : (
                        <span style={{ color: 'var(--color-success)' }}>✓</span>
                      )}
                    </td>

                    {/* Columnas Editables */}
                    {COLUMNS.map((col, colIndex) => {
                      const value = row[col.key] ?? '';
                      const hasCellError = col.key === 'providerRut' && errors.providerRut;
                      const hasAmountError = col.key === 'totalAmount' && errors.amounts;

                      return (
                        <td key={col.key} data-label={col.label} style={{ padding: '2px' }} onClick={() => setActiveRowId(row.id)}>
                          {col.type === 'select' ? (
                            <select
                              data-row={rowIndex}
                              data-col={col.key}
                              value={value}
                              onChange={(e) => handleCellChange(row.id, col.key, e.target.value)}
                              onFocus={(e) => {
                                editingCellRef.current = { rowId: row.id, key: col.key, value: e.target.value };
                              }}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                              className="spreadsheet-select"
                              style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--color-text-primary)',
                                outline: 'none',
                                padding: '6px',
                                minHeight: '44px'
                              }}
                            >
                              {col.key === 'expenseType' && <option value="" disabled>Seleccione...</option>}
                              {col.options.map(opt => (
                                <option key={opt} value={opt} style={{ background: 'var(--color-bg-secondary)' }}>
                                  {col.key === 'taxStatus' ? TAX_STATUS_LABELS[opt] : opt}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              data-row={rowIndex}
                              data-col={col.key}
                              type={col.type}
                              value={value}
                              onChange={(e) => handleCellChange(row.id, col.key, col.type === 'number' ? Number(e.target.value) : e.target.value)}
                              onFocus={(e) => {
                                editingCellRef.current = { rowId: row.id, key: col.key, value: e.target.value };
                              }}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, colIndex)}
                              onBlur={() => {
                                if (col.key === 'providerRut' && value) {
                                  handleCellChange(row.id, 'providerRut', formatRut(value));
                                }
                              }}
                              className="spreadsheet-input"
                              style={{
                                width: '100%',
                                background: 'transparent',
                                border: 'none',
                                color: hasCellError || hasAmountError ? 'var(--color-danger)' : 'var(--color-text-primary)',
                                outline: 'none',
                                padding: '6px',
                                textDecoration: hasCellError ? 'underline dotted var(--color-danger)' : 'none',
                                fontWeight: col.key === 'totalAmount' ? 'bold' : 'normal',
                                minHeight: '44px'
                              }}
                              title={hasCellError ? errors.providerRut : hasAmountError ? errors.amounts : ''}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Visor de Documento Lateral */}
        <div className="card document-viewer-card p-4 space-y-4" style={{ position: 'sticky', top: '20px' }}>
          <h3 className="font-semibold border-b border-slate-800 pb-2 flex justify-between items-center text-sm">
            <span><Icon name="photo" />Documento activo</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              {rows.findIndex(r => r.id === activeRowId) + 1} de {rows.length}
            </span>
          </h3>

          {previewImageUrl ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div 
                style={{ 
                  width: '100%', 
                  height: '240px', 
                  borderRadius: '6px', 
                  overflow: 'hidden', 
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <img 
                  src={previewImageUrl} 
                  alt="Activo" 
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} 
                />
              </div>
              <div className="text-xs text-slate-400 space-y-1 bg-slate-900/60 p-2 rounded border border-slate-800">
                <p className="truncate"><strong>Archivo:</strong> {rows.find(r => r.id === activeRowId)?.file?.name}</p>
                <p><strong>Tamaño:</strong> {((rows.find(r => r.id === activeRowId)?.file?.size || 0) / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <a 
                href={previewImageUrl} 
                target="_blank" 
                rel="noreferrer" 
                className="btn btn-secondary w-full text-center text-xs"
                style={{ padding: '6px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <Icon name="search" size={14} style={{ verticalAlign: -2, marginRight: 4 }} />Abrir imagen en pestaña nueva
              </a>
            </div>
          ) : (
            <div className="text-center py-12 text-slate-500 text-xs">
              Selecciona una fila para ver el comprobante original.
            </div>
          )}
        </div>
      </div>

      {/* Manual de Navegación */}
      <div className="alert alert-info text-xs">
        <strong>Manual de Teclado:</strong> Usa <strong>Tab / Shift+Tab</strong> para moverte horizontalmente, y <strong>↑ / ↓</strong> o la tecla <strong>Enter</strong> para moverte verticalmente. Presiona <strong>Escape</strong> para cancelar tu edición y restaurar el valor anterior. Si hay errores (como un RUT incorrecto), se marcará con una advertencia.
      </div>
    </div>
  );
}
