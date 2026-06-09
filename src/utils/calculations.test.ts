import { describe, it, expect } from 'vitest';
import { getInvoicesForMonth, generateCategorySummary, buildYearMonths, generateMonthlySummary } from '../utils/calculations';

const mockInvoices = [
  { date: '2025-02-05', totalAmount: 13485, netAmount: 11332, ivaAmount: 2153, expenseType: 'Costo Insumos Varios', category: 'Materiales' },
  { date: '2025-02-10', totalAmount: 35385, netAmount: 20948, ivaAmount: 3980, specificTax: 10457, expenseType: 'Combustible', category: 'Combustible' },
  { date: '2025-03-01', totalAmount: 5000, netAmount: 4200, ivaAmount: 800, expenseType: 'Almuerzos', category: 'Alimentación' },
  { date: '2024-12-15', totalAmount: 10000, netAmount: 8400, ivaAmount: 1600, expenseType: 'Arriendo', category: 'Servicios' },
];

describe('calculations', () => {
  describe('getInvoicesForMonth', () => {
    it('should filter invoices by year and month', () => {
      const feb2025 = getInvoicesForMonth(mockInvoices, 2025, 2);
      expect(feb2025).toHaveLength(2);
      expect(feb2025.every(i => i.date.startsWith('2025-02'))).toBe(true);
    });

    it('should return empty array for non-matching month', () => {
      const jan2025 = getInvoicesForMonth(mockInvoices, 2025, 1);
      expect(jan2025).toHaveLength(0);
    });

    it('should handle empty input', () => {
      expect(getInvoicesForMonth([], 2025, 2)).toHaveLength(0);
    });
  });

  describe('generateCategorySummary', () => {
    it('should group by expenseType and sum amounts', () => {
      const summary = generateCategorySummary(mockInvoices);
      expect(summary).toHaveLength(4); // 4 unique expenseTypes

      const combustible = summary.find(s => s.category === 'Combustible');
      expect(combustible).toBeDefined();
      expect(combustible?.totalAmount).toBe(35385);
      expect(combustible?.count).toBe(1);
    });

    it('should sum multiple invoices of same category', () => {
      const duplicates = [
        ...mockInvoices,
        { ...mockInvoices[0], id: 'dup', totalAmount: 5000, netAmount: 4000, ivaAmount: 1000 },
      ];
      const summary = generateCategorySummary(duplicates);
      const insumos = summary.find(s => s.category === 'Costo Insumos Varios');
      expect(insumos?.totalAmount).toBe(18485);
      expect(insumos?.count).toBe(2);
    });
  });

  describe('buildYearMonths', () => {
    it('should return 12 months with totals', () => {
      const yearMonths = buildYearMonths(mockInvoices, 2025);
      expect(yearMonths).toHaveLength(12);
      
      const feb = yearMonths.find(m => m.month === 2);
      expect(feb?.totalAmount).toBe(48870); // 13485 + 35385
      expect(feb?.count).toBe(2);
      
      const mar = yearMonths.find(m => m.month === 3);
      expect(mar?.totalAmount).toBe(5000);
    });

    it('should have zero for months without invoices', () => {
      const yearMonths = buildYearMonths(mockInvoices, 2025);
      const jan = yearMonths.find(m => m.month === 1);
      expect(jan?.totalAmount).toBe(0);
      expect(jan?.count).toBe(0);
    });
  });

  describe('generateMonthlySummary', () => {
    it('should group by year-month and aggregate', () => {
      const summary = generateMonthlySummary(mockInvoices);
      expect(summary).toHaveLength(3); // feb 2025, mar 2025, dec 2024

      const feb2025 = summary.find(m => m.year === 2025 && m.month === 2);
      expect(feb2025?.totalAmount).toBe(48870);
      expect(feb2025?.netAmount).toBe(32280); // 11332 + 20948
      expect(feb2025?.ivaAmount).toBe(6133); // 2153 + 3980
      expect(feb2025?.count).toBe(2);
    });
  });
});