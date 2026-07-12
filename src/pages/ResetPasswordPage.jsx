import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import Icon from '../components/ui/Icon';

/**
 * Página de destino del enlace "restablecer contraseña" enviado por email.
 * Supabase autentica al usuario con el token del enlace (detectSessionInUrl)
 * y lo redirige aquí; esta página solo pide la contraseña nueva.
 */
export default function ResetPasswordPage() {
  const { updatePassword } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    try {
      const result = await updatePassword(password);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      addToast('Contraseña actualizada correctamente.', 'success');
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" style={{ maxWidth: 480, margin: '0 auto' }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Restablecer contraseña</h1>
          <p className="page-subtitle">Define una contraseña nueva para tu cuenta</p>
        </div>
      </div>

      <form className="card space-y-4" onSubmit={handleSubmit}>
        {error && (
          <div className="alert alert-danger">
            <Icon name="alert" size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>{error}</div>
          </div>
        )}

        <div className="form-group">
          <label className="form-label" htmlFor="new-password">Contraseña nueva</label>
          <div className="flex gap-2">
            <input
              id="new-password"
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              required
              autoComplete="new-password"
              autoFocus
              style={{ flex: 1, minHeight: '44px' }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShowPassword(!showPassword)}
              title={showPassword ? 'Ocultar' : 'Mostrar'}
              style={{ minHeight: '44px', width: '44px' }}
            >
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} />
            </button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="confirm-password">Repite la contraseña</label>
          <input
            id="confirm-password"
            className="form-input"
            type={showPassword ? 'text' : 'password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={6}
            required
            autoComplete="new-password"
            style={{ minHeight: '44px' }}
          />
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={loading} style={{ minHeight: '44px' }}>
          {loading ? <><div className="spinner" /> Guardando...</> : 'Guardar contraseña nueva'}
        </button>
      </form>
    </div>
  );
}
