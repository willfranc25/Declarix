import { Link } from 'react-router-dom';
import Icon from '../../components/ui/Icon';

/** Marco común para las páginas legales públicas. */
export default function LegalLayout({ title, updated, children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: 'var(--space-6)' }}>
        <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-4) 0' }}>
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: 'var(--color-text-primary)' }}>
            <span style={{
              width: 28, height: 28, borderRadius: 'var(--radius-md)', background: 'var(--color-accent)',
              color: 'white', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Icon name="document" size={16} />
            </span>
            Declarix
          </Link>
          <Link to="/login" className="btn btn-secondary btn-sm">Entrar</Link>
        </nav>

        <article className="card legal-body" style={{ marginTop: 'var(--space-4)' }}>
          <style>{`
            .legal-body h1 { font-size: var(--font-size-2xl); font-weight: 800; letter-spacing: -0.03em; margin-bottom: var(--space-1); }
            .legal-body .legal-updated { font-size: var(--font-size-xs); color: var(--color-text-tertiary); margin-bottom: var(--space-6); }
            .legal-body h2 { font-size: var(--font-size-lg); font-weight: 700; margin: var(--space-6) 0 var(--space-2); }
            .legal-body p, .legal-body li { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.8; }
            .legal-body ul { padding-left: var(--space-5); margin: var(--space-2) 0; }
            .legal-body strong { color: var(--color-text-primary); }
          `}</style>
          <h1>{title}</h1>
          <p className="legal-updated">Última actualización: {updated}</p>
          {children}
        </article>

        <footer style={{ padding: 'var(--space-6) 0', fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', display: 'flex', gap: 'var(--space-4)' }}>
          <span>© 2026 Declarix</span>
          <Link to="/terminos" style={{ color: 'inherit' }}>Términos</Link>
          <Link to="/privacidad" style={{ color: 'inherit' }}>Privacidad</Link>
        </footer>
      </div>
    </div>
  );
}
