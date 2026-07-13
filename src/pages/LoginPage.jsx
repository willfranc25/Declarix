import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Icon from '../components/ui/Icon';

export default function LoginPage() {
  const { login, signup, loginWithMagicLink, resetPassword } = useAuth();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showMagicLink, setShowMagicLink] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let result;
      if (isLogin) {
        result = await login(email, password);
      } else {
        result = await signup(email, password);
      }

      if (result.error) {
        setError(result.error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await loginWithMagicLink(email);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError('Revisa tu email para el enlace mágico');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError('');
    if (!email) {
      setError('Escribe tu correo arriba y vuelve a pulsar "¿Olvidaste tu contraseña?".');
      return;
    }
    setLoading(true);
    try {
      const result = await resetPassword(email);
      if (result.error) {
        setError(result.error.message);
      } else {
        setError(`Te enviamos un enlace a ${email} para restablecer tu contraseña.`);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (mode) => {
    const newIsLogin = mode === 'login';
    if (newIsLogin !== isLogin) {
      setIsLogin(newIsLogin);
      setError('');
      setShowMagicLink(false);
    }
  };

  return (
    <>
      <style>{`
        .login-shell {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.1fr 1fr;
        }
        .login-brand-panel {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: var(--space-10);
          background-color: var(--color-bg-tertiary);
          border-right: 1px solid var(--color-border);
          background-image: radial-gradient(var(--color-border) 1px, transparent 1px);
          background-size: 22px 22px;
          overflow: hidden;
        }
        .login-brand-logo {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: var(--space-3);
        }
        .login-brand-copy {
          position: relative;
          z-index: 1;
          max-width: 420px;
        }
        .login-brand-copy h2 {
          font-size: var(--font-size-3xl);
          font-weight: 700;
          letter-spacing: -0.02em;
          line-height: 1.2;
          color: var(--color-text-primary);
          margin-bottom: var(--space-3);
        }
        .login-brand-copy p {
          font-size: var(--font-size-base);
          color: var(--color-text-secondary);
          line-height: 1.6;
        }
        .login-brand-foot {
          position: relative;
          z-index: 1;
          font-size: var(--font-size-xs);
          color: var(--color-text-muted);
        }
        .login-form-panel {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          background: var(--color-bg-primary);
        }
        .login-card {
          width: 100%;
          max-width: 360px;
        }
        .login-title {
          font-size: var(--font-size-2xl);
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.02em;
          margin: 0 0 var(--space-1);
          line-height: 1.2;
        }
        .login-subtitle {
          font-size: var(--font-size-sm);
          color: var(--color-text-tertiary);
          margin-bottom: var(--space-8);
        }
        .login-options-row {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          margin-top: -4px;
        }
        @media (max-width: 860px) {
          .login-shell {
            grid-template-columns: 1fr;
          }
          .login-brand-panel {
            display: none;
          }
        }
      `}</style>
      <div className="login-shell">
        {/* Panel izquierdo: marca + patrón de puntos */}
        <div className="login-brand-panel" aria-hidden="true">
          <div className="login-brand-logo">
            <div style={{
              width: '36px', height: '36px',
              background: 'var(--color-accent)',
              borderRadius: 'var(--radius-lg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0
            }}>
              <Icon name="document" size={20} style={{ color: 'white' }} />
            </div>
            <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: '700', color: 'var(--color-text-primary)' }}>
              Declarix
            </span>
          </div>
          <div className="login-brand-copy">
            <h2>Boletas y facturas, listas para rendir.</h2>
            <p>Sube la foto de un comprobante, la IA extrae los datos y tú revisas antes de exportar. Sin planillas manuales.</p>
          </div>
          <p className="login-brand-foot">© 2026 Declarix</p>
        </div>

        {/* Panel derecho: formulario */}
        <div className="login-form-panel">
          <div className="login-card">
            <h1 className="login-title">{isLogin ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}</h1>
            <p className="login-subtitle">{isLogin ? 'Ingresa tus datos para continuar.' : 'Un solo plan, todo incluido.'}</p>

            {error && (
              <div style={{
                marginBottom: 'var(--space-5)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger-border)',
                color: 'var(--color-danger)',
                fontSize: 'var(--font-size-sm)',
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)'
              }}>
                <Icon name="alert" size={16} aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              <div className="form-group">
                <label htmlFor="email" className="form-label">Correo electrónico</label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@empresa.cl"
                  required
                  autoComplete="email"
                  disabled={loading}
                />
              </div>

              {(!isLogin || !showMagicLink) && (
                <div className="form-group" style={{ animation: 'slideUp 0.25s ease-out' }}>
                  <label htmlFor="password" className="form-label">Contraseña</label>
                  <input
                    id="password"
                    type="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required={!showMagicLink}
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    disabled={loading}
                  />
                </div>
              )}

              {isLogin && !showMagicLink && (
                <div className="login-options-row">
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={loading}
                    style={{
                      background: 'none', border: 'none',
                      color: 'var(--color-accent-light)',
                      fontSize: 'var(--font-size-sm)',
                      fontWeight: '500', cursor: 'pointer', padding: 0
                    }}
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: 'var(--space-2)' }}
                disabled={loading}
              >
                {loading ? 'Procesando...' : (isLogin ? 'Iniciar sesión' : 'Registrarme')}
              </button>
            </form>

            <div style={{ marginTop: 'var(--space-5)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <button
                type="button"
                onClick={() => setShowMagicLink(!showMagicLink)}
                className="btn btn-secondary"
                style={{ width: '100%' }}
                disabled={loading}
              >
                <Icon name="sparkles" size={16} />
                {showMagicLink ? 'Volver a usar contraseña' : 'Iniciar con enlace mágico'}
              </button>

              {showMagicLink && (
                <form onSubmit={handleMagicLink} style={{ animation: 'slideUp 0.3s ease-out' }}>
                  <button
                    type="submit"
                    className="btn btn-ghost"
                    style={{ width: '100%' }}
                    disabled={loading}
                  >
                    {loading ? 'Enviando...' : 'Enviar enlace a mi correo'}
                  </button>
                </form>
              )}
            </div>

            <div style={{
              marginTop: 'var(--space-6)',
              textAlign: 'center',
              fontSize: 'var(--font-size-sm)',
              color: 'var(--color-text-secondary)'
            }}>
              {isLogin ? '¿No tienes una cuenta?' : '¿Ya tienes una cuenta?'} {' '}
              <button
                type="button"
                onClick={() => switchMode(isLogin ? 'register' : 'login')}
                style={{
                  background: 'none', border: 'none', padding: 0,
                  color: 'var(--color-accent-light)',
                  fontWeight: '600', cursor: 'pointer'
                }}
              >
                {isLogin ? 'Regístrate' : 'Inicia sesión'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}