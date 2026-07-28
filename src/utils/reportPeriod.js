/**
 * Lógica pura del flujo de Reportes: cálculo del período a declarar,
 * filtrado de comprobantes por período + estado, y totales de la selección.
 * Extraído de ReportsPage para poder testearlo sin renderizar la página.
 */

const pad2 = (n) => String(n).padStart(2, '0');

/**
 * Mes anterior al actual (1-based). Es el período que normalmente se declara:
 * el F29 del mes N se presenta en el mes N+1 (hasta el día 20 por internet).
 */
export function previousMonth(today = new Date()) {
  let month = today.getMonth(); // getMonth() es 0-based → ya es el mes anterior en 1-based
  let year = today.getFullYear();
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return { month, year };
}

/**
 * Devuelve el rango [inicioISO, finISO] (YYYY-MM-DD, inclusive) según el modo:
 *  - 'month': el mes completo de `month` ({ month, year }).
 *  - 'range': desde el 1° de `rangeFrom` hasta el último día de `rangeTo`
 *    (si el usuario invierte el rango, se corrige solo).
 *  - 'year':  todo el año tributario `taxYear`.
 */
export function computePeriodRange(mode, { month, rangeFrom, rangeTo, taxYear } = {}) {
  if (mode === 'month') {
    const start = `${month.year}-${pad2(month.month)}-01`;
    const lastDay = new Date(month.year, month.month, 0).getDate();
    return [start, `${month.year}-${pad2(month.month)}-${pad2(lastDay)}`];
  }
  if (mode === 'range') {
    let a = rangeFrom;
    let b = rangeTo;
    if (a.year > b.year || (a.year === b.year && a.month > b.month)) [a, b] = [b, a];
    const start = `${a.year}-${pad2(a.month)}-01`;
    const lastDay = new Date(b.year, b.month, 0).getDate();
    return [start, `${b.year}-${pad2(b.month)}-${pad2(lastDay)}`];
  }
  return [`${taxYear}-01-01`, `${taxYear}-12-31`];
}

/**
 * Comprobantes dentro del rango, filtrados por estado y ordenados por fecha
 * descendente. `statusChip`: 'all' | 'pending' | 'declared' (binario: todo lo
 * que no está 'declared' cuenta como pendiente).
 */
export function filterInvoicesByPeriod(invoices, [start, end], statusChip = 'all') {
  return invoices
    .filter((inv) => inv.date >= start && inv.date <= end)
    .filter((inv) => {
      if (statusChip === 'pending') return inv.taxStatus !== 'declared';
      if (statusChip === 'declared') return inv.taxStatus === 'declared';
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Suma Neto / IVA / Total de un conjunto de comprobantes (la selección). */
export function sumInvoiceTotals(rows) {
  return rows.reduce(
    (acc, inv) => ({
      netAmount: acc.netAmount + (inv.netAmount || 0),
      ivaAmount: acc.ivaAmount + (inv.ivaAmount || 0),
      totalAmount: acc.totalAmount + (inv.totalAmount || 0),
    }),
    { netAmount: 0, ivaAmount: 0, totalAmount: 0 }
  );
}

/** Años presentes en los datos + el año actual, de mayor a menor. */
export function availableYears(invoices, today = new Date()) {
  const years = new Set([today.getFullYear()]);
  invoices.forEach((inv) => {
    const y = Number(String(inv.date).slice(0, 4));
    if (!Number.isNaN(y)) years.add(y);
  });
  return Array.from(years).sort((a, b) => b - a);
}
