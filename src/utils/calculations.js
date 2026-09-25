import { signedAmount, documentKey } from './documentRules';
/**
 * Detecta si un comprobante es duplicado comparando proveedor + número + total.
 */
export function detectDuplicate(existingInvoices, newInvoice) {
  const key = documentKey(newInvoice);
  return key ? existingInvoices.find(inv => documentKey(inv) === key) || null : null;
}

/**
 * Genera resumen mensual agrupando facturas por año-mes.
 */
export function generateMonthlySummary(invoices) {
  const map = new Map();

  for (const inv of invoices) {
    const [yearStr, monthStr] = inv.date.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const key = `${year}-${String(month).padStart(2, '0')}`;

    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.netAmount += signedAmount(inv, 'netAmount');
      existing.ivaAmount += signedAmount(inv, 'ivaAmount');
      existing.specificTax += signedAmount(inv, 'specificTax');
      existing.totalAmount += signedAmount(inv, 'totalAmount');
    } else {
      map.set(key, {
        year,
        month,
        count: 1,
        netAmount: signedAmount(inv, 'netAmount'),
        ivaAmount: signedAmount(inv, 'ivaAmount'),
        specificTax: signedAmount(inv, 'specificTax'),
        totalAmount: signedAmount(inv, 'totalAmount'),
      });
    }
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);
}

/**
 * Genera resumen por categoría (tipo de gasto).
 */
export function generateCategorySummary(invoices) {
  const map = new Map();

  for (const inv of invoices) {
    const cat = inv.expenseType || 'Sin clasificar';
    const existing = map.get(cat);
    if (existing) {
      existing.count += 1;
      existing.netAmount += signedAmount(inv, 'netAmount');
      existing.ivaAmount += signedAmount(inv, 'ivaAmount');
      existing.totalAmount += signedAmount(inv, 'totalAmount');
    } else {
      map.set(cat, {
        category: cat,
        count: 1,
        netAmount: signedAmount(inv, 'netAmount'),
        ivaAmount: signedAmount(inv, 'ivaAmount'),
        totalAmount: signedAmount(inv, 'totalAmount'),
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
}

/**
 * Filtra facturas por mes y año.
 */
export function getInvoicesForMonth(invoices, year, month) {
  return invoices.filter((inv) => {
    const [y, m] = inv.date.split('-').map(Number);
    return y === year && m === month;
  });
}

/**
 * Construye datos mensuales para gráfico de barras de un año completo.
 */
export function buildYearMonths(invoices, year) {
  return Array.from({ length: 12 }, (_, i) => {
    const m = i + 1;
    const list = getInvoicesForMonth(invoices, year, m);
    return {
      year,
      month: m,
      count: list.length,
      netAmount: list.reduce((s, inv) => s + (signedAmount(inv, 'netAmount')), 0),
      ivaAmount: list.reduce((s, inv) => s + (signedAmount(inv, 'ivaAmount')), 0),
      totalAmount: list.reduce((s, inv) => s + (signedAmount(inv, 'totalAmount')), 0),
    };
  });
}
