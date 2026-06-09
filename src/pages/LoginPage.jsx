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
    setIsLogin(mode === 'login');
    setError('');
    setShowMagicLink(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-2xl shadow-lg">
            <span className="text-3xl">📋</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
            Saludent
          </h1>
          <p className="text-slate-400 mt-1 text-sm">Gestor de Boletas F29</p>
        </div>

        {/* Form Card */}
        <div className="card p-6 sm:p-8">
          <div className="space-y-6">
            {/* Tabs */}
            <div className="flex border-b border-slate-700" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={isLogin}
                aria-controls="login-panel"
                id="login-tab"
                onClick={() => switchMode('login')}
                className={`flex-1 py-3 text-center font-medium text-sm transition-all ${
                  isLogin
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Iniciar Sesión
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={!isLogin}
                aria-controls="register-panel"
                id="register-tab"
                onClick={() => switchMode('register')}
                className={`flex-1 py-3 text-center font-medium text-sm transition-all ${
                  !isLogin
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                Registro
              </button>
            </div>

            {/* Error */}
            {error && (
              <div
                className="alert alert-danger text-sm p-3"
                role="alert"
                style={{ animation: 'slideUp 0.3s ease-out' }}
              >
                <span className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </span>
              </div>
            )}

            {/* Form */}
            <form
              onSubmit={handleSubmit}
              className="space-y-4"
              id={isLogin ? 'login-panel' : 'register-panel'}
              role="tabpanel"
              aria-labelledby={isLogin ? 'login-tab' : 'register-tab'}
            >
              <div className="form-group">
                <label htmlFor="email" className="form-label">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  className="form-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  autoComplete="email"
                  disabled={loading}
                  aria-describedby="email-hint"
                />
                <span id="email-hint" className="text-xs text-slate-500">Te enviaremos el enlace mágico aquí</span>
              </div>

              {(!isLogin || !showMagicLink) && (
                <div className="form-group">
                  <label htmlFor="password" className="form-label">
                    Contraseña
                  </label>
                  <input
                    id="password"
                    type="password"
                    className="form-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required={!showMagicLink}
                    minLength={6}
                    autoComplete={isLogin ? "current-password" : "new-password"}
                    disabled={loading}
                  />
                  {!isLogin && (
                    <p className="text-xs text-slate-500 mt-1">Mínimo 6 caracteres</p>
                  )}
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary w-full py-3 text-base"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner mr-2" style={{ width: '18px', height: '18px' }} />
                    <span>Cargando...</span>
                  </>
                ) : isLogin ? (
                  'Entrar'
                ) : (
                  'Crear Cuenta'
                )}
              </button>
            </form>

            {/* Magic Link Option */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-4 bg-slate-800/50 text-slate-500">o continúa con</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowMagicLink(!showMagicLink)}
              className="btn btn-secondary w-full py-2"
              disabled={loading}
              aria-expanded={showMagicLink}
            >
              {showMagicLink ? 'Volver a contraseña' : 'Enlace mágico por email'}
            </button>

            {showMagicLink && (
              <form
                onSubmit={handleMagicLink}
                className="space-y-4 mt-4 pt-4 border-t border-slate-700 animate-slide-up"
              >
                <p className="text-sm text-slate-400 text-center">
                  Te enviaremos un enlace para entrar sin contraseña
                </p>
                <div className="form-group">
                  <label htmlFor="magicEmail" className="form-label">Email</label>
                  <input
                    id="magicEmail"
                    type="email"
                    className="form-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.com"
                    required
                    autoComplete="email"
                    disabled={loading}
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-secondary w-full py-2"
                  disabled={loading}
                >
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>
            )}

            {/* Footer */}
            <p className="text-center text-xs text-slate-500 pt-2 border-t border-slate-700">
              Al continuar, aceptas los términos de uso y política de privacidad
            </p>
          </div>
        </div>

        {/* Info */}
        <div className="text-center mt-6 text-sm text-slate-500">
          <p>🔒 Tus datos están seguros y solo tú puedes verlos</p>
          <p className="mt-1">Funciona offline · PWA instalable · Sync en la nube</p>
        </div>
      </div>
    </div>
  );
}