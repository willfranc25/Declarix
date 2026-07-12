import { Component } from 'react';
import logger from '../utils/logger';

/**
 * Barrera de errores de render: en vez de la pantalla en blanco de React,
 * muestra un mensaje amable con opción de recargar, y reporta el error.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logger.error('[ErrorBoundary] Error de render no capturado:', error, info?.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="loading-screen" style={{ minHeight: '100vh', padding: 'var(--space-6)' }}>
        <div className="card" style={{ maxWidth: 480, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 'var(--space-2)' }}>Algo salió mal</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 'var(--space-4)' }}>
            Ocurrió un error inesperado. Tus datos están a salvo — recarga la página para continuar.
          </p>
          <button className="btn btn-primary" onClick={() => window.location.reload()}>
            Recargar la página
          </button>
        </div>
      </div>
    );
  }
}
