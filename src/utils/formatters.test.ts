import { describe, it, expect } from 'vitest';
import { formatCurrency, formatDate, formatDateTime, getMonthName, getStatusLabel, getStatusVariant } from '../utils/formatters';

describe('formatters', () => {
  describe('formatCurrency', () => {
    it('should format positive numbers with $ and thousands separator', () => {
      expect(formatCurrency(0)).toBe('$0');
      expect(formatCurrency(1000)).toBe('$1.000');
      expect(formatCurrency(13485)).toBe('$13.485');
      expect(formatCurrency(1000000)).toBe('$1.000.000');
    });

    it('should handle decimal numbers (rounds)', () => {
      expect(formatCurrency(13485.50)).toBe('$13.486');
    });

    it('should handle negative numbers with $ prefix', () => {
      expect(formatCurrency(-1000)).toBe('$-1.000');
    });
  });

  describe('formatDate', () => {
    it('should format YYYY-MM-DD to DD/MM/YYYY', () => {
      expect(formatDate('2025-02-05')).toBe('05/02/2025');
      expect(formatDate('2026-12-31')).toBe('31/12/2026');
      expect(formatDate('2025-01-01')).toBe('01/01/2025');
    });

    it('should return original string for invalid format', () => {
      expect(formatDate('invalid')).toBe('invalid');
      expect(formatDate('')).toBe('');
      expect(formatDate('2025/02/05')).toBe('2025/02/05');
    });
  });

  describe('formatDateTime', () => {
    it('should format ISO datetime to DD/MM/YYYY HH:mm', () => {
      expect(formatDateTime('2025-02-05T14:30:00')).toBe('05/02/2025 14:30');
      expect(formatDateTime('2025-02-05T00:00:00')).toBe('05/02/2025 00:00');
    });
  });

  describe('getMonthName', () => {
    it('should return spanish month names', () => {
      expect(getMonthName(1)).toBe('Enero');
      expect(getMonthName(6)).toBe('Junio');
      expect(getMonthName(12)).toBe('Diciembre');
    });

    it('should return empty string for invalid months', () => {
      expect(getMonthName(0)).toBe('');
      expect(getMonthName(13)).toBe('');
    });
  });

  // Estado binario: 'declared' = ya exportada en una rendición;
  // cualquier otro valor (incluidos los legacy) cuenta como pendiente.
  describe('getStatusLabel', () => {
    it('declared es Declarada; todo lo demás es Pendiente', () => {
      expect(getStatusLabel('declared')).toBe('Declarada');
      expect(getStatusLabel('pending')).toBe('Pendiente');
      expect(getStatusLabel('reviewed')).toBe('Pendiente');
      expect(getStatusLabel('approved')).toBe('Pendiente');
      expect(getStatusLabel(undefined as unknown as string)).toBe('Pendiente');
    });
  });

  describe('getStatusVariant', () => {
    it('declared es success; todo lo demás warning', () => {
      expect(getStatusVariant('declared')).toBe('success');
      expect(getStatusVariant('pending')).toBe('warning');
      expect(getStatusVariant('reviewed')).toBe('warning');
      expect(getStatusVariant(undefined as unknown as string)).toBe('warning');
    });
  });
});