import { describe, it, expect } from 'vitest';
import {
  previousMonth,
  computePeriodRange,
  filterInvoicesByPeriod,
  sumInvoiceTotals,
  availableYears,
} from '../utils/reportPeriod';

describe('previousMonth', () => {
  it('devuelve el mes anterior (mismo año)', () => {
    expect(previousMonth(new Date(2026, 6, 15))).toEqual({ month: 6, year: 2026 }); // julio → junio
  });
  it('cruza el año en enero (→ diciembre del año anterior)', () => {
    expect(previousMonth(new Date(2026, 0, 10))).toEqual({ month: 12, year: 2025 });
  });
});

describe('computePeriodRange', () => {
  it('mes: del 1° al último día, respetando meses de 30/31/28', () => {
    expect(computePeriodRange('month', { month: { month: 2, year: 2026 } }))
      .toEqual(['2026-02-01', '2026-02-28']); // febrero no bisiesto
    expect(computePeriodRange('month', { month: { month: 6, year: 2026 } }))
      .toEqual(['2026-06-01', '2026-06-30']);
    expect(computePeriodRange('month', { month: { month: 12, year: 2026 } }))
      .toEqual(['2026-12-01', '2026-12-31']);
  });

  it('febrero bisiesto llega hasta el 29', () => {
    expect(computePeriodRange('month', { month: { month: 2, year: 2028 } }))
      .toEqual(['2028-02-01', '2028-02-29']);
  });

  it('rango: del 1° del primer mes al último día del último', () => {
    expect(computePeriodRange('range', {
      rangeFrom: { month: 4, year: 2026 },
      rangeTo: { month: 6, year: 2026 },
    })).toEqual(['2026-04-01', '2026-06-30']);
  });

  it('rango invertido se corrige solo', () => {
    expect(computePeriodRange('range', {
      rangeFrom: { month: 6, year: 2026 },
      rangeTo: { month: 4, year: 2026 },
    })).toEqual(['2026-04-01', '2026-06-30']);
  });

  it('año tributario: el año completo', () => {
    expect(computePeriodRange('year', { taxYear: 2026 })).toEqual(['2026-01-01', '2026-12-31']);
  });
});

const inv = (id: string, date: string, taxStatus: string, amounts = {}) => ({
  id, date, taxStatus, netAmount: 0, ivaAmount: 0, totalAmount: 0, ...amounts,
});

describe('filterInvoicesByPeriod', () => {
  const invoices = [
    inv('a', '2026-06-05', 'pending'),
    inv('b', '2026-06-28', 'declared'),
    inv('c', '2026-05-30', 'pending'), // fuera del rango de junio
    inv('d', '2026-06-15', 'pending'),
  ];

  it('filtra por rango inclusive y ordena por fecha descendente', () => {
    const rows = filterInvoicesByPeriod(invoices, ['2026-06-01', '2026-06-30'], 'all');
    expect(rows.map((r) => r.id)).toEqual(['b', 'd', 'a']); // 28, 15, 05
  });

  it('filtro "pending" excluye las declaradas', () => {
    const rows = filterInvoicesByPeriod(invoices, ['2026-06-01', '2026-06-30'], 'pending');
    expect(rows.map((r) => r.id)).toEqual(['d', 'a']);
  });

  it('filtro "declared" solo las declaradas', () => {
    const rows = filterInvoicesByPeriod(invoices, ['2026-06-01', '2026-06-30'], 'declared');
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });
});

describe('sumInvoiceTotals', () => {
  it('suma neto, IVA y total de la selección', () => {
    const rows = [
      inv('a', '2026-06-01', 'pending', { netAmount: 1000, ivaAmount: 190, totalAmount: 1190 }),
      inv('b', '2026-06-02', 'pending', { netAmount: 500, ivaAmount: 95, totalAmount: 595 }),
    ];
    expect(sumInvoiceTotals(rows)).toEqual({ netAmount: 1500, ivaAmount: 285, totalAmount: 1785 });
  });
  it('selección vacía suma cero', () => {
    expect(sumInvoiceTotals([])).toEqual({ netAmount: 0, ivaAmount: 0, totalAmount: 0 });
  });
});

describe('availableYears', () => {
  it('incluye el año actual y los presentes en los datos, de mayor a menor', () => {
    const invoices = [inv('a', '2024-03-01', 'pending'), inv('b', '2026-01-01', 'pending')];
    expect(availableYears(invoices, new Date(2026, 5, 1))).toEqual([2026, 2024]);
  });
});
