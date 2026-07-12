/**
 * Logger central de la aplicación.
 *
 * - debug/info: solo en desarrollo (silenciados en producción).
 * - warn: visible siempre en consola, no se reporta.
 * - error: visible siempre y reportado al error tracker (Sentry) si está
 *   configurado vía VITE_SENTRY_DSN (ver main.jsx).
 *
 * Regla del proyecto: en src/ no se usa console.* directo — siempre logger.
 */

const isProd = import.meta.env.PROD;

let reporter = null;

/** Conecta un error tracker (objeto con captureException). */
export function setErrorReporter(instance) {
  reporter = instance;
}

function report(args) {
  if (!reporter?.captureException) return;
  try {
    const first = args[0];
    const error = first instanceof Error ? first : new Error(args.map(String).join(' '));
    reporter.captureException(error, { extra: { args: args.slice(1) } });
  } catch {
    // el reporte de errores nunca debe romper la app
  }
}

export const logger = {
  debug: (...args) => {
    if (!isProd) console.log(...args);
  },
  info: (...args) => {
    if (!isProd) console.info(...args);
  },
  warn: (...args) => {
    console.warn(...args);
  },
  error: (...args) => {
    console.error(...args);
    report(args);
  },
};

export default logger;
