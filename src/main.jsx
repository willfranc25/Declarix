import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';
import { initTheme } from './utils/theme';
import logger, { setErrorReporter } from './utils/logger';

// Aplicar el tema guardado antes del primer render (evita flash)
initTheme();

// Error tracking (opcional): se activa solo si VITE_SENTRY_DSN está definida.
// Carga perezosa: sin DSN, Sentry no entra al bundle inicial.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
  import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: sentryDsn,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
      });
      setErrorReporter(Sentry);
    })
    .catch((err) => logger.warn('Sentry no disponible:', err));
}

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({
      onNeedRefresh() {
        if (confirm('¡Nueva versión disponible! ¿Actualizar ahora?')) {
          window.location.reload();
        }
      },
      onOfflineReady() {
        logger.debug('App lista para funcionar offline');
      },
      onRegistered(r) {
        logger.debug('Service Worker registrado:', r.scope);
      },
      onRegisterError(error) {
        logger.error('Error registrando SW:', error);
      }
    });
  }).catch(err => {
    logger.warn('PWA register no disponible:', err);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);