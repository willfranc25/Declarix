import { formatRut } from './rutValidator';

/**
 * Formatea un número como moneda CLP chilena.
 * Ejemplo: 1234567 → "$ 1.234.567"
 */
export function formatCurrency(amount) {
  if (amount === null || amount === undefined || isNaN(amount)) return '$ 0';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) a formato DD/MM/YYYY.
 */
export function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${year}`;
}

/**
 * Formatea una fecha ISO completa a DD/MM/YYYY HH:MM.
 */
export function formatDateTime(isoStr) {
  if (!isoStr) return '';
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return isoStr;
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Formatea un RUT para display.
 */
export function formatRutDisplay(rut) {
  return formatRut(rut);
}

/**
 * Retorna el nombre del mes en español (1-based).
 */
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

export function getMonthName(month) {
  if (month < 1 || month > 12) return '';
  return MONTH_NAMES[month - 1];
}

/**
 * Retorna el label del status en español.
 */
export function getStatusLabel(status) {
  const labels = { pending: 'Pendiente', reviewed: 'Revisado', approved: 'Aprobado' };
  return labels[status] || status;
}

/**
 * Retorna la clase CSS para el badge de status.
 */
export function getStatusVariant(status) {
  const variants = { pending: 'warning', reviewed: 'info', approved: 'success' };
  return variants[status] || 'default';
}
