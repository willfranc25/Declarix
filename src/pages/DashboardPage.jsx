import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useInvoiceStore from '../store/invoiceStore';
import { formatCurrency, formatDate, getMonthName, getStatusLabel, getStatusVariant } from '../utils/formatters';
import { getInvoicesForMonth, generateCategorySummary, buildYearMonths } from '../utils/calculations';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const PIE_COLORS = ['#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#6366f1'];

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

  const goToPrevMonth = () => {
    setSelectedMonth((m) => m === 1 ? 12 : m - 1);
    if (activeMonth === 1) setSelectedYear((y) => y - 1);
  };

  const goToNextMonth = () => {
    const now = new Date();
    const nm = activeMonth === 12 ? 1 : activeMonth + 1;
    const ny = activeMonth === 12 ? activeYear + 1 : activeYear;
    if (ny > now.getFullYear() || (ny === now.getFullYear() && nm > now.getMonth() + 1)) return;
    setSelectedMonth(nm);
    setSelectedYear(ny);
  };

  if (isLoading) {
    return <div className="loading-screen"><div className="spinner" /><span>Cargando datos...</span></div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Resumen de gastos y métricas</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-ghost btn-icon" onClick={goToPrevMonth} title="Mes anterior">◀</button>
          <span className="font-semibold">{getMonthName(activeMonth)} {activeYear}</span>
          <button className="btn btn-ghost btn-icon" onClick={goToNextMonth} title="Mes siguiente">▶</button>
        </div>
      </div>

      {invoices.length === 0 && (
        <div className="alert alert-info">📊 No hay comprobantes aún. Sube tu primera boleta para ver tus datos.</div>
      )}

      {/* Metric Cards */}
      <div className="grid-metrics">
        <div className="metric-card">
          <div className="metric-icon blue">💰</div>
          <div className="metric-content">
            <div className="metric-label">Total Gastado</div>
            <div className="metric-value">{formatCurrency(metrics.total)}</div>
            <div className="metric-sub">{getMonthName(activeMonth)} {activeYear}</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon cyan">📊</div>
          <div className="metric-content">
            <div className="metric-label">Total Neto</div>
            <div className="metric-value">{formatCurrency(metrics.neto)}</div>
            <div className="metric-sub">Sin IVA</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon yellow">🧾</div>
          <div className="metric-content">
            <div className="metric-label">Total IVA</div>
            <div className="metric-value">{formatCurrency(metrics.iva)}</div>
            <div className="metric-sub">19%</div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">📄</div>
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
                    background: '#1e293b',
                    border: '1px solid rgba(148,163,184,0.12)',
                    borderRadius: '8px',
                    color: '#f1f5f9',
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
                  background: '#1e293b',
                  border: '1px solid rgba(148,163,184,0.12)',
                  borderRadius: '8px',
                  color: '#f1f5f9',
                }}
              />
              <Bar
                dataKey="totalAmount"
                name="Total"
                fill="url(#barGradient)"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
                onClick={(data) => {
                  setSelectedMonth(data.month);
                }}
              />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted text-center mt-2">💡 Haz clic en una barra para ver ese mes</p>
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
                    <td>{formatDate(inv.date)}</td>
                    <td className="truncate" style={{ maxWidth: 180 }}>{inv.providerName}</td>
                    <td className="table-mobile-hidden text-muted">{inv.expenseType}</td>
                    <td className="text-right text-mono">{formatCurrency(inv.totalAmount || 0)}</td>
                    <td className="text-center">
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
