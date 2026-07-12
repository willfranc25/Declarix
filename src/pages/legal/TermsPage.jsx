import LegalLayout from './LegalLayout';

export default function TermsPage() {
  return (
    <LegalLayout title="Términos de servicio" updated="11 de julio de 2026">
      <p>
        Estos términos regulan el uso de Declarix, un servicio de gestión de
        comprobantes tributarios para personas y empresas en Chile. Al crear una
        cuenta aceptas estos términos.
      </p>

      <h2>1. El servicio</h2>
      <p>
        Declarix permite digitalizar boletas, facturas y otros comprobantes
        mediante fotografías, extraer sus datos con inteligencia artificial,
        revisarlos y exportarlos a planillas de rendición.
      </p>
      <p>
        <strong>Declarix no presta asesoría tributaria ni contable.</strong> La
        extracción automática puede contener errores: eres responsable de revisar
        los datos antes de usarlos en declaraciones, rendiciones o cualquier
        trámite ante el Servicio de Impuestos Internos u otros organismos.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Debes entregar información veraz y mantener la confidencialidad de tu contraseña.</li>
        <li>Eres responsable de la actividad realizada desde tu cuenta y tu organización.</li>
        <li>Puedes cerrar tu cuenta en cualquier momento escribiendo a soporte.</li>
      </ul>

      <h2>3. Planes y pagos</h2>
      <p>
        El plan Gratis tiene límites de uso publicados en la página de precios.
        Los planes de pago se contratan por contacto directo y se facturan en
        pesos chilenos. Los límites de cada plan pueden ajustarse con aviso
        previo razonable; nunca reduciremos retroactivamente lo ya contratado.
      </p>

      <h2>4. Contenido y datos</h2>
      <p>
        Los comprobantes, imágenes y datos que subes son tuyos. Nos otorgas
        únicamente el permiso necesario para procesarlos y prestarte el servicio
        (incluido el envío de las imágenes al proveedor de IA para su lectura).
        El tratamiento de datos personales se describe en la{' '}
        <a href="/privacidad">Política de Privacidad</a>.
      </p>

      <h2>5. Uso aceptable</h2>
      <ul>
        <li>No uses el servicio para actividades ilícitas ni para procesar documentos de terceros sin autorización.</li>
        <li>No intentes vulnerar la seguridad ni acceder a datos de otras organizaciones.</li>
        <li>No revendas el servicio sin acuerdo escrito.</li>
      </ul>

      <h2>6. Disponibilidad y garantías</h2>
      <p>
        El servicio se entrega "tal cual". Trabajamos por mantenerlo disponible y
        respaldado, pero no garantizamos disponibilidad ininterrumpida. Nuestra
        responsabilidad total frente a cualquier reclamo se limita al monto
        pagado por el servicio en los últimos 12 meses.
      </p>

      <h2>7. Término</h2>
      <p>
        Podemos suspender cuentas que infrinjan estos términos, previo aviso
        cuando sea posible. Al cierre de una cuenta puedes solicitar la
        exportación de tus datos dentro de 30 días.
      </p>

      <h2>8. Ley aplicable</h2>
      <p>
        Estos términos se rigen por las leyes de la República de Chile. Cualquier
        controversia será conocida por los tribunales ordinarios de justicia de
        Chile.
      </p>

      <h2>Contacto</h2>
      <p>
        Dudas sobre estos términos: <a href="mailto:soporte@declarix.cl">soporte@declarix.cl</a>.
      </p>

      <p style={{ marginTop: 'var(--space-6)', fontStyle: 'italic' }}>
        Nota: este documento es un borrador inicial y debe ser revisado por un
        abogado antes del lanzamiento comercial.
      </p>
    </LegalLayout>
  );
}
