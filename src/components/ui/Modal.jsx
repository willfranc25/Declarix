import { useEffect, useRef } from 'react';
import Icon from './Icon';

/**
 * Modal accesible reutilizable:
 *   - Escape y clic en el overlay cierran
 *   - Focus trap (Tab no escapa del diálogo) y foco inicial dentro
 *   - Restaura el foco al elemento que lo abrió
 *   - role="dialog" + aria-modal + aria-labelledby
 *
 * `ConfirmDialog` (abajo) cubre las confirmaciones destructivas,
 * reemplazando window.confirm().
 */

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Comportamiento accesible de diálogo: Escape cierra, Tab queda atrapado
 * dentro, foco inicial dentro del diálogo y restauración del foco al cerrar.
 * Usable también en modales con estructura propia (formularios, etc.).
 */
export function useDialogBehavior(dialogRef, onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const opener = document.activeElement;
    const dialog = dialogRef.current;

    // Foco inicial: primer elemento interactivo del cuerpo (o el diálogo)
    const focusables = dialog?.querySelectorAll(FOCUSABLE);
    if (focusables?.length) {
      focusables[0].focus();
    } else {
      dialog?.focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab' || !dialog) return;

      const items = Array.from(dialog.querySelectorAll(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, [dialogRef, onClose, active]);
}

export default function Modal({ title, onClose, children, actions, className = '', maxWidth }) {
  const dialogRef = useRef(null);
  const titleId = useRef(`modal-title-${Math.random().toString(36).slice(2, 8)}`);

  useDialogBehavior(dialogRef, onClose);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={dialogRef}
        className={`modal ${className}`}
        style={maxWidth ? { maxWidth, width: '90%' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId.current}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" id={titleId.current}>{title}</h3>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Confirmación accesible para acciones importantes o destructivas.
 * Renderizar condicionalmente: {confirmOpen && <ConfirmDialog ... />}
 */
export function ConfirmDialog({
  title = 'Confirmar',
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      actions={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? <><div className="spinner" /> Procesando...</> : confirmLabel}
          </button>
        </>
      }
    >
      <p style={{ color: 'var(--color-text-secondary)', whiteSpace: 'pre-line', margin: 0 }}>{message}</p>
    </Modal>
  );
}
