import { cleanRut, hasRutFormat, validateRut } from '../utils/rutValidator';
import { hasRutConfirmation } from '../utils/documentRules';

export default function RutConfirmation({ document, onChange, disabled = false }) {
  if (!hasRutFormat(document.providerRut) || validateRut(document.providerRut)) return null;
  const confirmed = hasRutConfirmation(document);
  return <div className="text-sm" style={{ marginTop: 8, color: 'var(--color-warning)' }}>
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: disabled ? 'wait' : 'pointer' }}>
      <input type="checkbox" checked={confirmed} disabled={disabled}
        onChange={e => onChange(e.target.checked ? { rut: cleanRut(document.providerRut), confirmed: true } : null)}
        style={{ marginTop: 3, flexShrink: 0 }} />
      <span>Confirmo que el RUT coincide con el original</span>
    </label>
    <p style={{ marginTop: 6, marginBottom: 0 }}>
      {confirmed ? 'Se guardará tal como está impreso, con una advertencia de validación.' : 'Si verificaste todos sus números en la boleta, puedes guardarlo sin cambiarlos.'}
    </p>
  </div>;
}
