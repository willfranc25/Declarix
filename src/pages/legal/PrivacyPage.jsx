import LegalLayout from './LegalLayout';

export default function PrivacyPage() {
  return (
    <LegalLayout title="Política de privacidad" updated="11 de julio de 2026">
      <p>
        Esta política describe qué datos personales trata Declarix, con qué fin y
        con qué resguardos, conforme a la Ley N° 19.628 y a la Ley N° 21.719 de
        protección de datos personales de Chile.
      </p>

      <h2>1. Responsable</h2>
      <p>
        Declarix es el responsable del tratamiento. Contacto:{' '}
        <a href="mailto:soporte@declarix.cl">soporte@declarix.cl</a>.
      </p>

      <h2>2. Datos que tratamos</h2>
      <ul>
        <li><strong>Cuenta:</strong> correo electrónico y contraseña (cifrada).</li>
        <li>
          <strong>Comprobantes:</strong> imágenes de boletas/facturas y los datos
          extraídos de ellas (RUT y nombre de proveedores, montos, fechas, tipos
          de gasto). Pueden incluir datos de terceros (tus proveedores).
        </li>
        <li><strong>Uso:</strong> registros técnicos de operaciones (extracciones, exportaciones) asociados a tu organización, usados para aplicar los límites del plan.</li>
        <li><strong>Errores:</strong> si ocurre una falla, registramos información técnica del error para diagnosticarla.</li>
      </ul>

      <h2>3. Finalidades</h2>
      <ul>
        <li>Prestar el servicio: digitalizar, validar, almacenar y exportar tus comprobantes.</li>
        <li>Operar los límites y la facturación del plan contratado.</li>
        <li>Seguridad, prevención de fraude y soporte.</li>
      </ul>
      <p>No vendemos tus datos ni los usamos para publicidad de terceros.</p>

      <h2>4. Encargados y transferencias</h2>
      <p>Usamos proveedores que procesan datos por cuenta nuestra:</p>
      <ul>
        <li><strong>Supabase</strong> (base de datos, autenticación y almacenamiento de imágenes; infraestructura en AWS).</li>
        <li><strong>Vercel</strong> (alojamiento de la aplicación y funciones de servidor).</li>
        <li><strong>Google (Gemini)</strong>: las imágenes de comprobantes se envían a la API de Google para extraer sus datos. No se usan para entrenar modelos según las condiciones de la API pagada.</li>
        <li><strong>Sentry</strong> (si está habilitado): reportes técnicos de errores.</li>
      </ul>
      <p>
        Estos proveedores pueden estar ubicados fuera de Chile; exigimos
        resguardos contractuales y técnicos adecuados.
      </p>

      <h2>5. Aislamiento y seguridad</h2>
      <ul>
        <li>Cada organización está aislada a nivel de base de datos (Row Level Security).</li>
        <li>Las imágenes se almacenan en carpetas privadas por usuario; no hay URLs públicas.</li>
        <li>Cifrado en tránsito (TLS) y en reposo en la infraestructura de los proveedores.</li>
        <li>Las claves de los proveedores de IA viven solo en el servidor, nunca en tu navegador.</li>
      </ul>

      <h2>6. Conservación</h2>
      <p>
        Conservamos tus datos mientras tu cuenta esté activa y según el historial
        de tu plan. Al eliminar un comprobante se elimina también su imagen. Al
        cerrar tu cuenta, eliminamos o anonimizamos tus datos dentro de 60 días,
        salvo obligación legal de conservación.
      </p>

      <h2>7. Tus derechos</h2>
      <p>
        Puedes ejercer los derechos de acceso, rectificación, supresión,
        oposición y portabilidad escribiendo a{' '}
        <a href="mailto:soporte@declarix.cl">soporte@declarix.cl</a>. También
        puedes exportar tus datos en cualquier momento desde Configuración →
        Respaldo. Si consideras que el tratamiento vulnera la ley, puedes
        reclamar ante la Agencia de Protección de Datos Personales.
      </p>

      <h2>8. Cambios</h2>
      <p>
        Si modificamos esta política de forma sustantiva, te avisaremos por
        correo o dentro de la aplicación antes de que el cambio entre en
        vigencia.
      </p>

      <p style={{ marginTop: 'var(--space-6)', fontStyle: 'italic' }}>
        Nota: este documento es un borrador inicial y debe ser revisado por un
        abogado antes del lanzamiento comercial.
      </p>
    </LegalLayout>
  );
}
