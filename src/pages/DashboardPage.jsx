import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getMonthName, getStatusLabel, getStatusVariant } from '../utils/formatters';
import { getInvoicesForMonth, generateCategorySummary, buildYearMonths } from '../utils/calculations';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import Icon from '../components/ui/Icon';

const PIE_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

const MONTH_SHORT_NAMES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

export default function DashboardPage() {
  const navigate = useNavigate();
  const { invoices, loadInvoices, isLoading } = useInvoiceStore();

  useEffect(() => { loadInvoices(); }, [loadInvoices]);

  const defaultDate = useMemo(() => {
    if (invoices.length === 0) {
      const now = new Date();
      return { year: now.getFullYear(), month: now.getMonth() + 1 };
    }
    const sorted = [...invoices].sort((a, b) => b.date.localeCompare(a.date));
    const [y, m] = sorted[0].date.split('-').map(Number);
    return { year: y, month: m };
  }, [invoices]);

  const [selectedYear, setSelectedYear] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null);

  useEffect(() => {
    if (selectedYear === null) {
      setSelectedYear(defaultDate.year);
      setSelectedMonth(defaultDate.month);
    }
  }, [defaultDate, selectedYear]);

  const activeYear = selectedYear ?? defaultDate.year;
  const activeMonth = selectedMonth ?? defaultDate.month;

  // Picker States
  const [showPicker, setShowPicker] = useState(false);
  const [pickerYear, setPickerYear] = useState(activeYear);
  const pickerRef = useRef(null);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Dynamically calculate the minimum year from invoices or default to 5 years ago
  const minYear = useMemo(() => {
    const currentY = new Date().getFullYear();
    if (invoices.length === 0) return currentY - 5;
    const years = invoices.map(inv => Number(inv.date.split('-')[0])).filter(y => !isNaN(y));
    if (years.length === 0) return currentY - 5;
    return Math.min(...years, currentY - 5);
  }, [invoices]);

  // Click outside listener to close the picker on desktop
  useEffect(() => {
    if (!showPicker) return;
    const handleOutsideClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [showPicker]);

  const monthInvoices = useMemo(() => getInvoicesForMonth(invoices, activeYear, activeMonth), [invoices, activeYear, activeMonth]);

  const metrics = useMemo(() => ({
    total: monthInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0),
    neto: monthInvoices.reduce((s, i) => s + (i.netAmount || 0), 0),
    iva: monthInvoices.reduce((s, i) => s + (i.ivaAmount || 0), 0),
    count: monthInvoices.length,
  }), [monthInvoices]);

  const categoryData = useMemo(() => generateCategorySummary(monthInvoices), [monthInvoices]);
  const barData = useMemo(() => buildYearMonths(invoices, activeYear), [invoices, activeYear]);

  const recentInvoices = useMemo(
    () => [...invoices].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5),
    [invoices]
  );

  if (isLoading) {
    return <div className="loading-screen"><div className="spinner" /><span>Cargando datos...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <style>{`
        .datepicker-container {
          position: relative;
        }

        .picker-toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          min-height: 44px;
          padding: 0 var(--space-4);
          font-size: var(--font-size-base);
          font-weight: 600;
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-border);
          background: var(--color-bg-elevated);
          backdrop-filter: blur(12px);
          color: var(--color-text-primary);
          cursor: pointer;
          transition: all var(--transition-base);
          user-select: none;
        }

        .picker-toggle-btn:hover {
          border-color: rgba(59, 130, 246, 0.4);
          background: var(--color-bg-hover);
          box-shadow: var(--shadow-sm);
        }

        .picker-toggle-btn:focus-visible {
          outline: 2px solid var(--color-accent);
          outline-offset: 2px;
        }

        .datepicker-popover {
          position: absolute;
          top: calc(100% + 8px);
          right: 0;
          z-index: 1000;
          width: 280px;
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-xl);
          box-shadow: var(--shadow-lg);
          backdrop-filter: blur(20px);
          padding: var(--space-4);
          animation: pickerFadeIn 150ms cubic-bezier(0.4, 0, 0.2, 1);
        }

        @keyframes pickerFadeIn {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .datepicker-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: var(--space-3);
          border-bottom: 1px solid var(--color-border-light);
          padding-bottom: var(--space-2);
        }

        .datepicker-year-nav {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 44px;
          height: 44px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: transparent;
          color: var(--color-text-secondary);
          font-size: 1.1rem;
          cursor: pointer;
          transition: all var(--transition-fast);
        }

        .datepicker-year-nav:hover:not(:disabled) {
          background: var(--color-bg-hover);
          color: var(--color-text-primary);
          border-color: var(--color-border);
        }

        .datepicker-year-nav:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .datepicker-year-display {
          font-size: var(--font-size-md);
          font-weight: 700;
          color: var(--color-text-primary);
          user-select: none;
        }

        .datepicker-months-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: var(--space-2);
        }

        .datepicker-month-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 44px;
          border-radius: var(--radius-md);
          border: 1px solid transparent;
          background: var(--color-surface-light);
          color: var(--color-text-primary);
          font-family: var(--font-family);
          font-size: var(--font-size-sm);
          font-weight: 500;
          cursor: pointer;
          transition: all var(--transition-fast);
          user-select: none;
        }

        .datepicker-month-btn:hover:not(:disabled) {
          background: var(--color-bg-hover);
          border-color: var(--color-border);
        }

        .datepicker-month-btn.active {
          background: var(--gradient-primary);
          color: white;
          font-weight: 700;
          box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
        }

        .datepicker-month-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
          background: transparent;
          color: var(--color-text-muted);
        }

        .datepicker-backdrop {
          display: none;
        }

        @media (max-width: 768px) {
          .datepicker-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.6);
            backdrop-filter: blur(4px);
            z-index: 999;
          }

          .datepicker-popover {
            position: fixed;
            top: auto;
            bottom: var(--space-6);
            left: 50%;
            right: auto;
            transform: translateX(-50%);
            width: calc(100% - 32px);
            max-width: 320px;
            box-shadow: 0 -10px 25px rgba(0, 0, 0, 0.5), var(--shadow-xl);
            z-index: 1000;
            animation: pickerSlideUp 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
          }

          @keyframes pickerSlideUp {
            from {
              opacity: 0;
              transform: translate(-50%, 20px);
            }
            to {
              opacity: 1;
              transform: translate(-50%, 0);
            }
          }

          .table td, .table th {
            padding: 12px 16px;
          }

          .btn-sm {
            min-height: 44px;
            padding: 0 var(--space-4);
          }
        }
      `}</style>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen de gastos y métricas</p>
        </div>
        <div className="datepicker-container" ref={pickerRef}>
          <button
            type="button"
            className="picker-toggle-btn"
            onClick={() => {
              setShowPicker(!showPicker);
              setPickerYear(activeYear);
            }}
            aria-label="Seleccionar fecha"
            aria-expanded={showPicker}
          >
            <span>{getMonthName(activeMonth)} {activeYear}</span>
            <Icon name="chevron-down" size={14} style={{ opacity: 0.7 }} />
          </button>

          {showPicker && (
            <>
              <div className="datepicker-backdrop" onClick={() => setShowPicker(false)} />
              <div className="datepicker-popover">
                <div className="datepicker-header">
                  <button
                    type="button"
                    className="datepicker-year-nav"
                    onClick={() => setPickerYear((y) => y - 1)}
                    disabled={pickerYear <= minYear}
                    aria-label="Año anterior"
                  >
                    <Icon name="chevron-left" size={16} />
                  </button>
                  <span className="datepicker-year-display">{pickerYear}</span>
                  <button
                    type="button"
                    className="datepicker-year-nav"
                    onClick={() => setPickerYear((y) => y + 1)}
                    disabled={pickerYear >= currentYear}
                    aria-label="Año siguiente"
                  >
                    <Icon name="chevron-right" size={16} />
                  </button>
                </div>
                <div className="datepicker-months-grid">
                  {MONTH_SHORT_NAMES.map((name, index) => {
                    const m = index + 1;
                    const isSelected = activeYear === pickerYear && activeMonth === m;
                    const isFuture = pickerYear > currentYear || (pickerYear === currentYear && m > currentMonth);
                    return (
                      <button
                        key={m}
                        type="button"
                        className={`datepicker-month-btn ${isSelected ? 'active' : ''}`}
                        disabled={isFuture}
                        onClick={() => {
                          setSelectedYear(pickerYear);
                          setSelectedMonth(m);
                          setShowPicker(false);
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {invoices.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon" style={{ background: 'var(--color-accent-glow)', color: 'var(--color-accent-light)' }}>
            <Icon name="camera" size={24} />
          </div>
          <div className="empty-state-title">Aún no hay comprobantes</div>
          <p className="empty-state-text">
            Sube la foto de tu primera boleta y la IA extraerá los datos por ti.
          </p>
          <button className="btn btn-primary mt-4" onClick={() => navigate('/upload')}>
            <Icon name="upload" /> Subir primera boleta
          </button>
        </div>
      )}

      {/* Metric Cards — una sola tarjeta dividida por separadores internos */}
      <div className="grid-metrics">
        <div className="metric-card">
          <div className="metric-content">
            <div className="metric-label">Total Gastado</div>
            <div className="metric-value">{formatCurrency(metrics.total)}</div>
            <div className="metric-sub">{getMonthName(activeMonth)} {activeYear}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <div className="metric-label">Total Neto</div>
            <div className="metric-value">{formatCurrency(metrics.neto)}</div>
            <div className="metric-sub">Sin IVA</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <div className="metric-label">Total IVA</div>
            <div className="metric-value">{formatCurrency(metrics.iva)}</div>
            <div className="metric-sub">19%</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-content">
            <div className="metric-label">Comprobantes</div>
            <div className="metric-value">{metrics.count}</div>
            <div className="metric-sub">{getMonthName(activeMonth)} {activeYear}</div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid-charts">
        {/* Pie Chart — Categorías */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Gastos por Categoría</h3>
          </div>
          {categoryData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="totalAmount"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  innerRadius={50}
                  paddingAngle={2}
                >
                  {categoryData.map((_, index) => (
                    <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatCurrency(value)}
                  contentStyle={{
                    background: 'var(--color-bg-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: '6px',
                    color: 'var(--color-text-primary)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state" style={{ padding: '3rem' }}>
              <p className="text-muted text-sm">Sin datos para este mes</p>
            </div>
          )}
          {/* Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
            {categoryData.slice(0, 6).map((cat, i) => (
              <div key={cat.category} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#94a3b8' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {cat.category}
              </div>
            ))}
          </div>
        </div>

        {/* Bar Chart — Mensual */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Gastos Mensuales {activeYear}</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" />
              <XAxis
                dataKey="month"
                tickFormatter={(m) => getMonthName(m).slice(0, 3)}
                stroke="#64748b"
                fontSize={11}
              />
              <YAxis
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                stroke="#64748b"
                fontSize={11}
              />
              <Tooltip
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(m) => getMonthName(m)}
                contentStyle={{
                  background: 'var(--color-bg-secondary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: '6px',
                  color: 'var(--color-text-primary)',
                }}
              />
              <Bar
                dataKey="totalAmount"
                name="Total"
                fill="#3b82f6"
                radius={[2, 2, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  setSelectedMonth(data.month);
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted text-center mt-2">Haz clic en una barra para ver ese mes</p>
        </div>
      </div>

      {/* Recent Invoices */}
      {recentInvoices.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Últimos Comprobantes</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/invoices')}>
              Ver todos →
            </button>
          </div>
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th className="table-mobile-hidden">Tipo Gasto</th>
                  <th className="text-right">Total</th>
                  <th className="text-center">Estado</th>
                </tr>
              </thead>
              <tbody>
                {recentInvoices.map((inv) => (
                  <tr key={inv.id} className="clickable" onClick={() => navigate(`/invoices/${inv.id}`)}>
                    <td data-label="Fecha">{formatDate(inv.date)}</td>
                    <td data-label="Proveedor" className="truncate" style={{ maxWidth: 180 }}>{inv.providerName}</td>
                    <td data-label="Tipo Gasto" className="table-mobile-hidden text-muted">{inv.expenseType}</td>
                    <td data-label="Total" className="text-right text-mono">{formatCurrency(inv.totalAmount || 0)}</td>
                    <td data-label="Estado" className="text-center">
                      <span className={`badge badge-${getStatusVariant(inv.status)}`}>
                        {getStatusLabel(inv.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
