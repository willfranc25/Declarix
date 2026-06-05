import { useState, useMemo, useRef, useEffect } from 'react';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getMonthName } from '../utils/formatters';
import { generateMonthlySummary, generateCategorySummary } from '../utils/calculations';
import { exportToRendicion, exportToExcel, exportToCSV, downloadFile } from '../services/exportService';

export default function ReportsPage() {
  const invoices = useInvoiceStore((state) => state.invoices);
  const templateInputRef = useRef(null);

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [templateBuffer, setTemplateBuffer] = useState(null);
  const [templateName, setTemplateName] = useState('Cargando plantilla predeterminada...');
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(true);

  // Filter invoices by date range
  const filtered = useMemo(() => {
    if (!startDate && !endDate) return invoices;
    return invoices.filter((inv) => {
      const d = new Date(inv.date);
      if (startDate && endDate) return d >= new Date(startDate) && d <= new Date(endDate);
      if (startDate) return d >= new Date(startDate);
      if (endDate) return d <= new Date(endDate);
      return true;
    });
  }, [invoices, startDate, endDate]);

  const monthly = useMemo(() => generateMonthlySummary(filtered), [filtered]);
  const category = useMemo(() => generateCategorySummary(filtered), [filtered]);

  const totals = useMemo(() => filtered.reduce((acc, inv) => ({
    count: acc.count + 1,
    netAmount: acc.netAmount + (inv.netAmount || 0),
    ivaAmount: acc.ivaAmount + (inv.ivaAmount || 0),
    specificTax: acc.specificTax + (inv.specificTax || 0),
    totalAmount: acc.totalAmount + (inv.totalAmount || 0),
  }), { count: 0, netAmount: 0, ivaAmount: 0, specificTax: 0, totalAmount: 0 }), [filtered]);

  // Cargar plantilla por defecto al iniciar
  useEffect(() => {
    const loadDefaultTemplate = async () => {
      try {
        const response = await fetch('/template.xlsm');
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          setTemplateBuffer(buffer);
        } else {
          setTemplateName(''); // No se encontró
        }
      } catch (error) {
        console.error('Error cargando plantilla por defecto:', error);
        setTemplateName('');
      } finally {
        setIsLoadingTemplate(false);
      }
    };
    loadDefaultTemplate();
  }, []);

  // Template upload (Sobreescribe la predeterminada)
  const handleTemplateUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTemplateName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setTemplateBuffer(ev.target.result);
    reader.readAsArrayBuffer(file);
  };

  // Export handlers
  const handleExportRendicion = async () => {
    if (!templateBuffer) {
      alert('Primero carga la plantilla Excel (.xlsm o .xlsx)');
      return;
    }
    const data = await exportToRendicion(filtered, templateBuffer, {
      fechaRendicion: formatDate(new Date().toISOString().split('T')[0]),
    });
    
    // Guardar siempre como .xlsx ya que ExcelJS empaqueta en ese formato internamente
    const filename = `Rendicion-${new Date().toISOString().split('T')[0]}.xlsx`;
    const mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      
    downloadFile(data, filename, mimeType);
  };

  const handleExportExcel = () => {
    const data = exportToExcel(filtered, { includeMonthlySheet: true, includeCategorySheet: true });
    downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  };

  const handleExportCSV = () => {
    const data = exportToCSV(filtered);
    downloadFile(data, `Comprobantes-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes</h1>
          <p className="page-subtitle">Resumen de gastos y exportación de datos</p>
        </div>
      </div>

      {/* Date Filters */}
      <div className="card">
        <h3 className="card-title mb-4">Filtrar por rango de fechas</h3>
        <div className="filters-bar">
          <div className="form-group">
            <label className="form-label">Fecha inicio</label>
            <input className="form-input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha fin</label>
            <input className="form-input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ alignSelf: 'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setStartDate(''); setEndDate(''); }}>Limpiar</button>
          </div>
        </div>
      </div>

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
                    <td className="font-semibold">{getMonthName(m.month)} {m.year}</td>
                    <td className="text-right">{m.count}</td>
                    <td className="text-right text-mono">{formatCurrency(m.netAmount)}</td>
                    <td className="text-right text-mono">{formatCurrency(m.ivaAmount)}</td>
                    <td className="text-right text-mono font-semibold">{formatCurrency(m.totalAmount)}</td>
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
                    <td className="font-semibold">{c.category}</td>
                    <td className="text-right">{c.count}</td>
                    <td className="text-right text-mono">{formatCurrency(c.netAmount)}</td>
                    <td className="text-right text-mono">{formatCurrency(c.ivaAmount)}</td>
                    <td className="text-right text-mono font-semibold">{formatCurrency(c.totalAmount)}</td>
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

        {/* Template upload */}
        <div className="alert alert-info mb-4">
          <span>📄</span>
          <div style={{ flex: 1 }}>
            <strong>Exportar a Rendición Saludent:</strong> Carga tu plantilla Excel (.xlsm) y se rellenará con los datos filtrados.
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button className="btn btn-secondary" onClick={() => templateInputRef.current?.click()}>
            📁 {templateName ? `Plantilla: ${templateName}` : 'Cargar Plantilla .xlsm'}
          </button>
          <input ref={templateInputRef} type="file" accept=".xlsm,.xlsx" onChange={handleTemplateUpload} style={{ display: 'none' }} />
          <button className="btn btn-primary" onClick={handleExportRendicion} disabled={!templateBuffer}>
            📊 Exportar a Rendición
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 'var(--space-4)' }}>
          <p className="text-sm text-muted mb-4">Exportaciones simples:</p>
          <div className="flex gap-3 flex-wrap">
            <button className="btn btn-secondary" onClick={handleExportExcel}>📗 Excel Simple</button>
            <button className="btn btn-secondary" onClick={handleExportCSV}>📄 CSV</button>
          </div>
        </div>
      </div>
    </div>
  );
}
