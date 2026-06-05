/**
 * Limpia un RUT removiendo puntos, guiones y espacios.
 */
export function cleanRut(rut) {
  if (!rut || typeof rut !== 'string') return '';
  return rut.replace(/[-.\s]/g, '').toUpperCase();
}

/**
 * Valida un RUT chileno usando el algoritmo módulo 11.
 */
export function validateRut(rut) {
  if (!rut || typeof rut !== 'string') return false;
  const cleaned = cleanRut(rut);
  if (!/^\d{7,8}[\dK]$/.test(cleaned)) return false;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const digits = body.split('').reverse();
  const sequence = [2, 3, 4, 5, 6, 7];
  let sum = 0;

  for (let i = 0; i < digits.length; i++) {
    sum += parseInt(digits[i], 10) * sequence[i % sequence.length];
  }

  const remainder = 11 - (sum % 11);
  let expectedDv;
  if (remainder === 11) expectedDv = '0';
  else if (remainder === 10) expectedDv = 'K';
  else expectedDv = String(remainder);

  return dv === expectedDv;
}

/**
 * Formatea un RUT al formato estándar XX.XXX.XXX-X.
 */
export function formatRut(rut) {
  if (!rut || typeof rut !== 'string') return '';
  const cleaned = cleanRut(rut);
  if (!/^\d{7,8}[\dK]$/.test(cleaned)) return rut;

  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}-${dv}`;
}
