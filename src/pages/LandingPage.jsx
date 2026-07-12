import { Link } from 'react-router-dom';
import Icon from '../components/ui/Icon';

/**
 * Landing pública (raíz sin sesión).
 * Elemento firma: la transformación boleta térmica → fila validada,
 * construida en CSS puro con el vocabulario real del rubro (RUT, IVA 19%).
 */

const PLANS = [
  {
    name: 'Gratis',
    price: '0',
    period: 'para siempre',
    features: ['1 usuario', '30 boletas al mes', '30 extracciones con IA', 'Exportación a Excel'],
    cta: 'Crear cuenta',
    highlight: false,
  },
  {
    name: 'Independiente',
    price: '9.900',
    period: 'CLP / mes',
    features: ['1 usuario', '200 boletas al mes', '200 extracciones con IA', 'Historial de 24 meses'],
    cta: 'Contactar',
    highlight: false,
  },
  {
    name: 'Pyme',
    price: '19.900',
    period: 'CLP / mes',
    features: ['5 usuarios (incluye a tu contador)', '600 boletas al mes', 'Exportaciones ilimitadas', 'Historial completo'],
    cta: 'Contactar',
    highlight: true,
  },
  {
    name: 'Contador',
    price: '39.900',
    period: 'CLP / mes',
    features: ['Usuarios ilimitados', 'Boletas ilimitadas', 'Múltiples empresas cliente', 'Soporte prioritario'],
    cta: 'Contactar',
    highlight: false,
  },
];

const STEPS = [
  {
    n: '01',
    title: 'Saca la foto',
    text: 'Desde el celular, varias a la vez desde tu galería. Puedes subir 100 boletas de una sentada: la extracción sigue aunque cambies de página.',
  },
  {
    n: '02',
    title: 'Revisa por excepción',
    text: 'La IA extrae proveedor, RUT, montos e IVA, y valida cada campo. Tú corriges solo las boletas que traen problemas — no las 95 que salieron bien.',
  },
  {
    n: '03',
    title: 'Exporta la rendición',
    text: 'Excel con el formato exacto de tu empresa, fórmulas intactas. Listo para entregar al contador o adjuntar a la rendición.',
  },
];

const FAQS = [
  {
    q: '¿Reemplaza a mi contador?',
    a: 'No. Declarix le ahorra a tu contador (y a ti) las horas de digitación y ordenamiento. La revisión y la declaración siguen siendo de ustedes.',
  },
  {
    q: '¿Qué documentos entiende?',
    a: 'Boletas, boletas electrónicas, boletas de honorarios, facturas y notas de crédito chilenas. Valida el RUT con dígito verificador y cuadra neto + IVA contra el total.',
  },
  {
    q: '¿Quién puede ver mis datos?',
    a: 'Solo tu organización. Cada cuenta está aislada a nivel de base de datos (Row Level Security) y las imágenes viven en carpetas privadas por usuario.',
  },
  {
    q: '¿Cómo se pagan los planes?',
    a: 'El plan Gratis no pide tarjeta. Los planes de pago se activan por contacto directo mientras habilitamos el pago en línea.',
  },
];

export default function LandingPage() {
  return (
    <div className="landing">
      <style>{`
        .landing {
          min-height: 100vh;
          background: var(--color-bg-primary);
          color: var(--color-text-primary);
        }
        .landing-inner { max-width: 1080px; margin: 0 auto; padding: 0 var(--space-6); }

        /* ── Nav ── */
        .landing-nav {
          display: flex; align-items: center; justify-content: space-between;
          padding: var(--space-5) 0;
        }
        .landing-brand { display: flex; align-items: center; gap: var(--space-2); font-weight: 700; letter-spacing: -0.02em; font-size: var(--font-size-lg); }
        .landing-brand-mark {
          width: 32px; height: 32px; border-radius: var(--radius-md);
          background: var(--color-accent); color: white;
          display: flex; align-items: center; justify-content: center;
        }
        .landing-nav-links { display: flex; align-items: center; gap: var(--space-5); }
        .landing-nav-links a { color: var(--color-text-secondary); font-size: var(--font-size-sm); font-weight: 500; }
        .landing-nav-links a:hover { color: var(--color-text-primary); }

        /* ── Hero ── */
        .landing-hero {
          display: grid; grid-template-columns: 1.1fr 1fr; gap: var(--space-10);
          align-items: center; padding: var(--space-12) 0;
        }
        .landing-h1 {
          font-size: clamp(2rem, 4.5vw, 3.1rem);
          font-weight: 800; letter-spacing: -0.04em; line-height: 1.08;
          margin-bottom: var(--space-4);
        }
        .landing-h1 .marker {
          position: relative; white-space: nowrap;
        }
        .landing-h1 .marker::after {
          content: ''; position: absolute; left: -2px; right: -2px; bottom: 0.06em;
          height: 0.32em; background: var(--color-accent-glow);
          border-radius: 2px; z-index: -1;
        }
        .landing-sub {
          font-size: var(--font-size-md); color: var(--color-text-secondary);
          line-height: 1.7; max-width: 46ch; margin-bottom: var(--space-6);
        }
        .landing-cta-row { display: flex; gap: var(--space-3); flex-wrap: wrap; align-items: center; }
        .landing-trust { margin-top: var(--space-3); font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

        /* ── Firma: boleta → fila ── */
        .hero-demo { display: flex; flex-direction: column; align-items: center; gap: var(--space-4); }
        .receipt {
          width: 250px; background: #fffdf6; color: #3f3a2e;
          padding: 18px 18px 26px;
          font-family: 'Courier New', ui-monospace, monospace;
          font-size: 12px; line-height: 1.75;
          box-shadow: var(--shadow-lg);
          border-radius: 2px 2px 0 0;
          /* borde inferior dentado, como papel térmico cortado */
          clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px),
            95% 100%, 90% calc(100% - 8px), 85% 100%, 80% calc(100% - 8px),
            75% 100%, 70% calc(100% - 8px), 65% 100%, 60% calc(100% - 8px),
            55% 100%, 50% calc(100% - 8px), 45% 100%, 40% calc(100% - 8px),
            35% 100%, 30% calc(100% - 8px), 25% 100%, 20% calc(100% - 8px),
            15% 100%, 10% calc(100% - 8px), 5% 100%, 0 calc(100% - 8px));
        }
        .receipt .r-center { text-align: center; }
        .receipt .r-strong { font-weight: 700; }
        .receipt .r-row { display: flex; justify-content: space-between; }
        .receipt .r-sep { border-top: 1px dashed #b8b09a; margin: 8px 0; }
        .receipt .r-total { font-size: 14px; font-weight: 700; }

        .hero-arrow { color: var(--color-accent); display: flex; flex-direction: column; align-items: center; gap: 2px; }
        .hero-arrow span { font-size: var(--font-size-xs); font-weight: 600; color: var(--color-text-tertiary); text-transform: uppercase; letter-spacing: 0.08em; }

        .result-row {
          display: flex; align-items: center; gap: var(--space-3);
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-success-border);
          border-radius: var(--radius-lg);
          padding: var(--space-3) var(--space-4);
          box-shadow: var(--shadow-md);
          font-size: var(--font-size-sm);
          animation: landingRowIn 0.6s ease-out 0.9s both;
        }
        .result-row .rr-rut {
          font-variant-numeric: tabular-nums; font-weight: 600;
          background: var(--color-bg-tertiary); border-radius: var(--radius-sm);
          padding: 2px 8px; font-size: var(--font-size-xs);
        }
        .result-row .rr-name { font-weight: 600; }
        .result-row .rr-amount { font-variant-numeric: tabular-nums; font-weight: 700; }
        @keyframes landingRowIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .result-row { animation: none; }
        }

        /* ── Secciones ── */
        .landing-section { padding: var(--space-12) 0; border-top: 1px solid var(--color-border-light); }
        .landing-eyebrow {
          font-size: var(--font-size-xs); font-weight: 700; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--color-accent-light); margin-bottom: var(--space-2);
        }
        .landing-h2 { font-size: clamp(1.5rem, 3vw, 2rem); font-weight: 700; letter-spacing: -0.03em; margin-bottom: var(--space-8); }

        .steps-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-6); }
        .step .step-n {
          font-variant-numeric: tabular-nums; font-weight: 800;
          font-size: var(--font-size-sm); color: var(--color-accent-light);
          margin-bottom: var(--space-2);
        }
        .step h3 { font-size: var(--font-size-lg); font-weight: 700; letter-spacing: -0.02em; margin-bottom: var(--space-2); }
        .step p { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.7; }

        .pricing-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--space-4); align-items: stretch; }
        .plan {
          border: 1px solid var(--color-border); border-radius: var(--radius-xl);
          padding: var(--space-6); background: var(--color-bg-elevated);
          display: flex; flex-direction: column; gap: var(--space-4);
        }
        .plan.highlight { border-color: var(--color-accent); box-shadow: var(--shadow-md); position: relative; }
        .plan.highlight::before {
          content: 'Más elegido'; position: absolute; top: -11px; left: var(--space-5);
          background: var(--color-accent); color: white; font-size: 11px; font-weight: 700;
          padding: 2px 10px; border-radius: var(--radius-full);
        }
        .plan-name { font-weight: 700; }
        .plan-price { font-size: 1.9rem; font-weight: 800; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
        .plan-price small { font-size: var(--font-size-xs); font-weight: 500; color: var(--color-text-tertiary); letter-spacing: 0; }
        .plan ul { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); flex: 1; }
        .plan li { font-size: var(--font-size-sm); color: var(--color-text-secondary); display: flex; gap: var(--space-2); align-items: flex-start; }
        .plan li svg { color: var(--color-success); flex-shrink: 0; margin-top: 3px; }
        .pricing-note { margin-top: var(--space-4); font-size: var(--font-size-xs); color: var(--color-text-tertiary); }

        .faq-list { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-6); }
        .faq-item h3 { font-size: var(--font-size-base); font-weight: 700; margin-bottom: var(--space-2); }
        .faq-item p { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.7; }

        .landing-final {
          text-align: center; padding: var(--space-12) 0;
          border-top: 1px solid var(--color-border-light);
        }

        .landing-footer {
          border-top: 1px solid var(--color-border);
          padding: var(--space-6) 0; display: flex; justify-content: space-between;
          align-items: center; flex-wrap: wrap; gap: var(--space-3);
          font-size: var(--font-size-xs); color: var(--color-text-tertiary);
        }
        .landing-footer nav { display: flex; gap: var(--space-4); }
        .landing-footer a { color: var(--color-text-tertiary); }
        .landing-footer a:hover { color: var(--color-text-primary); }

        @media (max-width: 900px) {
          .landing-hero { grid-template-columns: 1fr; padding: var(--space-8) 0; }
          .steps-grid { grid-template-columns: 1fr; }
          .pricing-grid { grid-template-columns: 1fr 1fr; }
          .faq-list { grid-template-columns: 1fr; }
        }
        @media (max-width: 560px) {
          .pricing-grid { grid-template-columns: 1fr; }
          .landing-nav-links a:not(.btn) { display: none; }
        }
      `}</style>

      <div className="landing-inner">
        <nav className="landing-nav" aria-label="Navegación principal">
          <div className="landing-brand">
            <div className="landing-brand-mark"><Icon name="document" size={18} /></div>
            Declarix
          </div>
          <div className="landing-nav-links">
            <a href="#como-funciona">Cómo funciona</a>
            <a href="#precios">Precios</a>
            <Link to="/login" className="btn btn-primary">Entrar</Link>
          </div>
        </nav>

        <header className="landing-hero">
          <div>
            <h1 className="landing-h1">
              La boleta entra como foto y sale como <span className="marker">rendición lista</span>.
            </h1>
            <p className="landing-sub">
              Declarix lee tus boletas chilenas con IA — proveedor, RUT, montos e IVA
              validados — para que revises solo las que traen problemas y exportes
              el Excel que tu contador espera.
            </p>
            <div className="landing-cta-row">
              <Link to="/login" className="btn btn-primary btn-lg">Crear cuenta gratis</Link>
              <a href="#precios" className="btn btn-secondary btn-lg">Ver precios</a>
            </div>
            <p className="landing-trust">Plan gratis de 30 boletas al mes · Sin tarjeta de crédito</p>
          </div>

          <div className="hero-demo" aria-hidden="true">
            <div className="receipt">
              <div className="r-center r-strong">FERRETERIA EL MAESTRO</div>
              <div className="r-center">R.U.T. 76.123.456-7</div>
              <div className="r-center">BOLETA ELECTRONICA N° 48.213</div>
              <div className="r-sep" />
              <div className="r-row"><span>2x PLANCHA YESO</span><span>8.400</span></div>
              <div className="r-row"><span>1x FIJACIONES</span><span>2.100</span></div>
              <div className="r-sep" />
              <div className="r-row"><span>NETO</span><span>10.500</span></div>
              <div className="r-row"><span>IVA 19%</span><span>1.995</span></div>
              <div className="r-row r-total"><span>TOTAL</span><span>$12.495</span></div>
            </div>

            <div className="hero-arrow">
              <Icon name="chevron-down" size={22} />
              <span>Declarix</span>
            </div>

            <div className="result-row">
              <Icon name="check-circle" size={18} style={{ color: 'var(--color-success)' }} />
              <span className="rr-rut">76.123.456-7 ✓</span>
              <span className="rr-name">Ferretería El Maestro</span>
              <span className="rr-amount">$12.495</span>
              <span className="badge badge-success">Lista</span>
            </div>
          </div>
        </header>

        <section className="landing-section" id="como-funciona">
          <p className="landing-eyebrow">Cómo funciona</p>
          <h2 className="landing-h2">Tres pasos, cero digitación</h2>
          <div className="steps-grid">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="step-n">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-section" id="precios">
          <p className="landing-eyebrow">Precios</p>
          <h2 className="landing-h2">Parte gratis, crece cuando te sirva</h2>
          <div className="pricing-grid">
            {PLANS.map((p) => (
              <div className={`plan ${p.highlight ? 'highlight' : ''}`} key={p.name}>
                <div>
                  <div className="plan-name">{p.name}</div>
                  <div className="plan-price">
                    ${p.price} <small>{p.period}</small>
                  </div>
                </div>
                <ul>
                  {p.features.map((f) => (
                    <li key={f}><Icon name="check" size={14} />{f}</li>
                  ))}
                </ul>
                {p.cta === 'Crear cuenta' ? (
                  <Link to="/login" className="btn btn-primary w-full">Crear cuenta</Link>
                ) : (
                  <a href={`mailto:soporte@declarix.cl?subject=${encodeURIComponent(`Plan ${p.name}`)}`} className="btn btn-secondary w-full">Contactar</a>
                )}
              </div>
            ))}
          </div>
          <p className="pricing-note">
            Precios en CLP, IVA incluido. Los planes de pago se activan por contacto directo
            mientras habilitamos el pago en línea.
          </p>
        </section>

        <section className="landing-section">
          <p className="landing-eyebrow">Preguntas frecuentes</p>
          <h2 className="landing-h2">Lo que preguntan antes de partir</h2>
          <div className="faq-list">
            {FAQS.map((f) => (
              <div className="faq-item" key={f.q}>
                <h3>{f.q}</h3>
                <p>{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="landing-final">
          <h2 className="landing-h2" style={{ marginBottom: 'var(--space-4)' }}>
            Tu próxima rendición, sin digitar
          </h2>
          <Link to="/login" className="btn btn-primary btn-lg">Crear cuenta gratis</Link>
        </section>

        <footer className="landing-footer">
          <span>© 2026 Declarix</span>
          <nav aria-label="Legal">
            <Link to="/terminos">Términos de servicio</Link>
            <Link to="/privacidad">Privacidad</Link>
            <a href="mailto:soporte@declarix.cl">soporte@declarix.cl</a>
          </nav>
        </footer>
      </div>
    </div>
  );
}
