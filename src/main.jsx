import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.jsx';

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
        console.log('App lista para funcionar offline');
      },
      onRegistered(r) {
        console.log('Service Worker registrado:', r.scope);
      },
      onRegisterError(error) {
        console.error('Error registrando SW:', error);
      }
    });
  }).catch(err => {
    console.warn('PWA register no disponible:', err);
  });
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);