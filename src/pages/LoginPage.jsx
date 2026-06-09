import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function LoginPage() {
  const { login, signup, loginWithMagicLink } = useAuth();
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

  const switchMode = (mode) => {
    const newIsLogin = mode === 'login';
    if (newIsLogin !== isLogin) {
      setIsLogin(newIsLogin);
      setError('');
      setShowMagicLink(false);
    }
  };

  const tabs = [
    { id: 'login', label: 'Iniciar Sesión', isActive: isLogin },
    { id: 'register', label: 'Registro', isActive: !isLogin },
  ];

  return (
    <>
      <style>{`
        .login-wrapper {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: var(--space-6);
          position: relative;
          overflow: hidden;
          background: var(--color-bg-primary);
        }
        .login-logo {
          position: absolute;
          top: var(--space-8);
          left: var(--space-8);
          display: flex;
          align-items: center;
          gap: var(--space-3);
          z-index: 20;
        }
        .login-card {
          width: 100%;
          max-width: 440px;
          padding: var(--space-10);
          position: relative;
          z-index: 10;
          border-radius: 24px;
          background-color: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          box-shadow: var(--shadow-xl);
          margin-top: 0;
        }
        .login-title {
          font-size: var(--font-size-3xl);
          font-weight: 700;
          color: var(--color-text-primary);
          letter-spacing: -0.02em;
          margin: 0;
          line-height: 1.2;
        }
        .login-options-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: -4px;
        }
        @media (max-width: 600px) {
          .login-wrapper {
            padding: var(--space-4);
            justify-content: flex-start;
          }
          .login-logo {
            position: relative;
            top: 0;
            left: 0;
            margin-bottom: var(--space-8);
            margin-top: var(--space-6);
            align-self: flex-start;
          }
          .login-card {
            padding: var(--space-6);
            border-radius: 16px;
          }
          .login-title {
            font-size: 24px; /* Evita que el texto desborde */
          }
          .login-options-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
            margin-top: 4px;
          }
        }
      `}</style>
      <div className="login-wrapper">
        
        {/* Background glowing effects to match dark theme */}
        <div style={{
          position: 'absolute',
          top: '-10%', left: '-10%',
          width: '40%', height: '40%',
          borderRadius: '50%',
          background: 'var(--color-accent)',
          opacity: '0.1',
          filter: 'blur(100px)',
          pointerEvents: 'none'
        }}></div>
        <div style={{
          position: 'absolute',
          bottom: '-10%', right: '-10%',
          width: '40%', height: '40%',
          borderRadius: '50%',
          background: 'var(--color-cyan)',
          opacity: '0.1',
          filter: 'blur(100px)',
          pointerEvents: 'none'
        }}></div>

        {/* Top Left Logo */}
        <div className="login-logo">
          <div style={{
            width: '40px', height: '40px',
            background: 'var(--color-accent)',
            borderRadius: 'var(--radius-lg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            flexShrink: 0
          }}>
            <span style={{ fontSize: '20px' }}>📋</span>
          </div>
          <span style={{
            fontSize: 'var(--font-size-xl)',
            fontWeight: '700',
            color: 'var(--color-text-primary)'
          }}>Saludent</span>
        </div>

        {/* Center Card */}
        <div className="card login-card">
          
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <p style={{
              fontSize: 'var(--font-size-base)',
              color: 'var(--color-text-tertiary)',
              marginBottom: 'var(--space-2)',
              fontWeight: '500'
            }}>
              {isLogin ? 'Ingresa tus datos' : 'Crea tu cuenta'}
            </p>
            <h1 className="login-title">
              {isLogin ? 'Bienvenido de nuevo' : 'Regístrate'}
            </h1>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              marginBottom: 'var(--space-6)',
              padding: 'var(--space-3)',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-danger-bg)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)'
            }}>
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
            <div>
              <input
                id="email"
                type="email"
                className="form-input"
                style={{
                  padding: '14px 16px',
                  fontSize: 'var(--font-size-md)',
                  borderRadius: 'var(--radius-lg)'
                }}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                required
                autoComplete="email"
                disabled={loading}
              />
            </div>

            {(!isLogin || !showMagicLink) && (
              <div style={{ animation: 'slideUp 0.25s ease-out' }}>
                <input
                  id="password"
                  type="password"
                  className="form-input"
                  style={{
                    padding: '14px 16px',
                    fontSize: 'var(--font-size-md)',
                    borderRadius: 'var(--radius-lg)'
                  }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  required={!showMagicLink}
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  disabled={loading}
                />
              </div>
            )}

            {isLogin && !showMagicLink && (
              <div className="login-options-row">
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  fontSize: 'var(--font-size-sm)',
                  color: 'var(--color-text-secondary)',
                  fontWeight: '500'
                }}>
                  <input type="checkbox" style={{
                    width: '16px', height: '16px',
                    accentColor: 'var(--color-accent)',
                    flexShrink: 0
                  }} />
                  Recordarme 30 días
                </label>
                <button type="button" style={{
                  background: 'none', border: 'none',
                  color: 'var(--color-accent-light)',
                  fontSize: 'var(--font-size-sm)',
                  fontWeight: '500', cursor: 'pointer', padding: 0
                }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>
            )}

            <button
              type="submit"
              className="btn btn-primary"
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--font-size-md)',
                borderRadius: 'var(--radius-lg)',
                marginTop: 'var(--space-2)'
              }}
              disabled={loading}
            >
              {loading ? 'Procesando...' : (isLogin ? 'Iniciar Sesión' : 'Regístrate')}
            </button>
          </form>

          {/* Secondary Options */}
          <div style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <button
              type="button"
              onClick={() => setShowMagicLink(!showMagicLink)}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '14px 16px',
                fontSize: 'var(--font-size-md)',
                borderRadius: 'var(--radius-lg)'
              }}
              disabled={loading}
            >
              <span style={{ fontSize: '20px', marginRight: '8px' }}>✨</span>
              {showMagicLink ? 'Volver a usar contraseña' : 'Iniciar con Enlace Mágico'}
            </button>

            {showMagicLink && (
              <form onSubmit={handleMagicLink} style={{ animation: 'slideUp 0.3s ease-out', marginTop: 'var(--space-2)' }}>
                <button
                  type="submit"
                  className="btn btn-ghost"
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    fontSize: 'var(--font-size-md)',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--color-text-primary)',
                    color: 'var(--color-bg-primary)',
                    fontWeight: '600'
                  }}
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : 'Enviar enlace a mi correo'}
                </button>
              </form>
            )}
          </div>

          <div style={{
            marginTop: 'var(--space-8)',
            textAlign: 'center',
            fontSize: 'var(--font-size-sm)',
            color: 'var(--color-text-secondary)',
            fontWeight: '500'
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
              {isLogin ? 'Regístrate' : 'Inicia Sesión'}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}