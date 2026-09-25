# Declarix: cuenta de contador y cartera de empresas

La versión actual está pensada para uso personal: una cuenta administra una o varias empresas, sin planes, pagos ni límites mensuales de procesamiento. El almacenamiento pertenece a la cuenta; documentos, categorías, reglas, plantillas, cierres y exportaciones pertenecen a cada empresa.

## Flujo implementado

1. Crear la cuenta y agregar razón social y RUT en **Mi cartera**.
2. Elegir la empresa de trabajo. Cargar JPEG, PNG, WEBP, PDF sin contraseña (hasta 20 páginas) o XML DTE. Máximo 20 MB por archivo; XML hasta 4 MB y 100 DTE.
3. Esperar a que termine la transferencia. Después, la cola continúa en servidor aunque se cierre el navegador. Los originales quedan privados antes de iniciar la extracción.
4. Revisar y corregir campos, impuestos, categoría, centro de costo y referencias. Datos ilegibles quedan sin completar; no se inventa fecha ni total. Los XML se interpretan sin llamar a Gemini; su lectura no valida firma ni aceptación del SII.
5. Guardar comprobantes revisados. Se conservan extracción original, comentarios y auditoría de cambios. Emisor, tipo y folio detectan duplicados dentro de cada empresa.
6. Preparar la rendición mensual, anual o por rango. El ZIP divide la plantilla en grupos de 25 y agrega Excel completo, índice con IDs y huella de plantilla y, opcionalmente, originales. Se preservan otras partes de XLSX/XLSM; las fórmulas se recalculan al abrir en Excel. Revisar las fórmulas de la plantilla para impuestos especiales/exentos/retenciones: el Excel completo contiene los montos documentados.
7. Exportar registra una instantánea y estado **Exportado**; no marca **Declarado**. Se puede cerrar/reabrir cada mes. La conciliación RCV compara un CSV descargado por el contador; no inicia sesión ni declara ante el SII.

## Suscripciones (idea futura, no activa)

La aplicación no implementa actualmente suscripciones, pagos, planes comerciales ni cupos mensuales. Para un eventual lanzamiento a contadores, se puede evaluar una suscripción mensual por cuenta con capacidad de procesamiento incluida y límites operacionales transparentes. Antes de fijar precio conviene medir durante un piloto el costo de IA, almacenamiento, tráfico, worker, soporte y reprocesos, además del uso mediano y de alto percentil. No se han definido niveles, precios, pasarela de pago ni fechas; nada de ese modelo está activo en esta versión.

## Despliegue coordinado

Las migraciones se prueban en Postgres local con PGlite, roles y RLS; esto no reproduce Auth, Storage, red ni eventos reales de Supabase. La migración cambia RLS y desactiva el antiguo `/api/extract` (410). No publicar únicamente el frontend ni aplicar la migración sobre producción sin ensayarla en una rama real y revisar las pertenencias y facturas sin empresa. La versión antigua y la nueva no son intercambiables.

1. Crear un respaldo de base de datos y objetos y ensayar restauración en un proyecto de pruebas. El ZIP de la app es una copia de documentos activos, no un respaldo completo de la base de datos.
2. En una base vacía, ejecutar primero `supabase/bootstrap.sql`: la tabla original se creó fuera del historial. Después aplicar las migraciones históricas en orden y `20260924180915_accountant_workspace.sql`. En una base existente con el historial aplicado, ejecutar solo la migración nueva. No repetirla: no es idempotente.
3. Revisar antes del cambio: empresas sin `created_by`, comprobantes sin usuario/empresa, usuarios distintos del creador dentro de la misma empresa y configuraciones antiguas. La propiedad nueva es `organizations.created_by`; las membresías históricas no conceden acceso. Los documentos huérfanos solo se asignan automáticamente cuando hay exactamente una empresa del propietario. Resolver manualmente los casos ambiguos con su dueño. Completar RUT de empresas existentes en Mi cartera.
4. Configurar `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para el navegador. Configurar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` y `CRON_SECRET` solo en servidor. Usar un proyecto Gemini con facturación verificada para documentos reales y comprobar cuotas/modelo disponibles. Nunca publicar claves con prefijo `VITE_`.
5. Publicar web y API, y arrancar un procesador persistente con `pnpm worker` en un servidor Node 24. Copiar `.env.worker.example` a `.env.worker` y configurar secretos fuera de Git. Un supervisor debe reiniciar el proceso si se detiene. Alternativamente, un scheduler autenticado puede llamar `/api/process-jobs` con `Authorization: Bearer CRON_SECRET`; cada llamada procesa un archivo. No hay cron contratado/configurado automáticamente.
6. Verificar en staging con dos cuentas reales: carga, cierre del navegador, recuperación, revisión, cambio de empresa, exportación y lectura denegada de originales de la otra cuenta. Verificar un PDF e imagen con Gemini real, confirmar costos y métricas. Las pruebas locales usan datos ficticios y el proveedor simulado; no sustituyen este paso.
7. Cambiar producción en una ventana controlada. Ante fallo, pausar procesamiento y restaurar conjuntamente aplicación/base desde respaldo verificado; no revertir solo el frontend dejando las nuevas políticas.

## Capacidad y control de gasto

`private.ai_control` arranca con 2 trabajos simultáneos, al menos 7 segundos entre inicios, presupuesto estimado diario de USD 5 y reserva conservadora de USD 0,50 por intento. Se bloquea la toma de nuevos trabajos si no alcanza presupuesto. Es un control interno estimado: no sustituye la facturación ni los controles de Google. Los fallos de costo incierto se contabilizan conservadoramente en el control; el registro de tokens no inventa consumo desconocido.

Los procesadores comparten este control en Postgres, con bloqueo de filas, leases de 3 minutos, recuperación de trabajos vencidos, reintentos acotados y reparto entre cuentas según su último inicio. Agregar procesadores no multiplica la cuota de Google. Aumentar concurrencia y presupuesto solo después de medir cuotas efectivas, errores 429, costo por página y tiempo de espera. Hay hasta 4 intentos automáticos y 8 totales con reintento manual.

Los archivos nuevos tienen cuota inicial de 500 MB por cuenta. Los originales se conservan para trazabilidad; archivar una empresa o eliminar un comprobante no libera ese espacio. Las cargas abandonadas se cancelan y sus objetos se limpian después de vencer el token de carga. La retención de documentos guardados y las ampliaciones de almacenamiento deben acordarse antes de vender paquetes grandes. El almacenamiento histórico no está incluido en ese contador.

Tarifas configurables mediante `GEMINI_INPUT_USD_PER_MILLION` y `GEMINI_OUTPUT_USD_PER_MILLION`; verificar precios antes de operar. Google hoy lista Gemini 3.1 Flash-Lite a USD 0,25 por millón de tokens de entrada (texto/imagen/video) y USD 1,50 por millón de salida; admite PDF, imagen y respuestas estructuradas. Es una alternativa razonable para comparar con el modelo actual en un conjunto autorizado de boletas/facturas antes de adoptarlo; no cambies el modelo de producción sin medir exactitud de RUT, folio, fecha, impuestos y total. Para información contable sensible, usa facturación de API pagada: Google indica que el contenido del nivel gratuito puede usarse para mejorar productos y que en pago no se utiliza para ese fin. El registro de intentos conserva modelo, tokens de entrada/salida/razonamiento, tiempo y costo estimado.

## Verificación incluida

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:server`, `pnpm test:db`, `pnpm build`. La base de pruebas PGlite ejecuta SQL real con roles/RLS y todas las migraciones; no reproduce Storage, Auth ni infraestructura distribuida de Supabase. Los smoke tests de CI comprueban portada/login/rutas públicas y protegidas. Las pruebas de exportación cubren 25, 26 y 100 documentos, notas de crédito, fórmulas y conservación de partes binarias.

## Límites y siguientes etapas

Quedan fuera de esta entrega la pasarela automática (requiere proveedor/cuenta comercial), invitaciones a asistentes del contador, Batch API diferida, correo entrante, conciliación bancaria, extracción local de texto PDF y una evaluación de precisión con documentos representativos autorizados. El cambio de enfoque solicitado concentra los permisos en el contador propietario. La restauración de ZIP históricos debe hacerse mediante una migración revisada: se retiró el formulario antiguo que podía mezclar empresas y fallar al restaurar originales. Los ajustes globales históricos no se copian indiscriminadamente entre empresas.

Antes de ofrecer grandes volúmenes: retención y precios de almacenamiento, paginación/filtrado de comprobantes completamente en servidor, métricas de tiempo de revisión/primera exportación y un ensayo de carga concurrente en staging. La lista actual pagina la descarga para evitar el corte de 1.000 filas, pero mantiene los documentos de la empresa en memoria del navegador.

Referencias: [cuotas Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), [facturación](https://ai.google.dev/gemini-api/docs/billing), [modelos](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [precios y uso del contenido](https://ai.google.dev/gemini-api/docs/pricing), [suscripciones Mercado Pago Chile](https://www.mercadopago.cl/developers/es/docs/subscriptions/overview), [webhooks Mercado Pago](https://www.mercadopago.cl/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [condiciones Gemini](https://ai.google.dev/gemini-api/terms).
