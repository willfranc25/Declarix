import { createContext, useCallback, useContext, useState } from 'react';
import Icon from './Icon';

/**
 * Sistema global de notificaciones (toasts).
 *
 * Reemplaza los `alert()` nativos: no bloquea la interfaz, respeta el tema
 * y es accesible (aria-live). Uso:
 *
 *   const { addToast } = useToast();
 *   addToast('Backup creado', 'success');
 */

const ToastContext = createContext(null);

const TOAST_STYLES = {
  info: { icon: 'info', bg: 'var(--color-bg-elevated)', border: 'var(--color-border)', color: 'var(--color-text-secondary)' },
  success: { icon: 'check-circle', bg: 'var(--color-success-bg)', border: 'var(--color-success-border)', color: 'var(--color-success)' },
  error: { icon: 'alert', bg: 'var(--color-danger-bg)', border: 'var(--color-danger-border)', color: 'var(--color-danger)' },
  warning: { icon: 'alert', bg: 'var(--color-warning-bg)', border: 'var(--color-warning-border)', color: 'var(--color-warning)' },
};

const AUTO_DISMISS_MS = 4500;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message, type = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => removeToast(id), AUTO_DISMISS_MS);
    return id;
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notificaciones">
        {toasts.map((toast) => {
          const s = TOAST_STYLES[toast.type] || TOAST_STYLES.info;
          return (
            <div
              key={toast.id}
              className="toast-item"
              role={toast.type === 'error' ? 'alert' : 'status'}
              style={{ background: s.bg, borderColor: s.border }}
            >
              <Icon name={s.icon} size={18} style={{ color: s.color, flexShrink: 0 }} />
              <span className="toast-message">{toast.message}</span>
              <button
                className="toast-close"
                onClick={() => removeToast(toast.id)}
                aria-label="Cerrar notificación"
              >
                <Icon name="x" size={14} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>');
  }
  return context;
}
