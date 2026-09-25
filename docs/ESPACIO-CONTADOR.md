# Declarix: cuenta de contador y cartera de empresas

Esta versión cambia la unidad de cuenta: un contador administra varias empresas. No crea una empresa ficticia al registrarse. El saldo y el almacenamiento pertenecen al contador; documentos, categorías, reglas, plantillas, cierres y exportaciones pertenecen a cada empresa.

## Flujo implementado

1. Crear la cuenta y agregar razón social y RUT en **Mi cartera**.
2. Elegir la empresa de trabajo. Cargar JPEG, PNG, WEBP, PDF sin contraseña (hasta 20 páginas) o XML DTE. Máximo 20 MB por archivo; XML hasta 4 MB y 100 DTE.
3. Esperar a que termine la transferencia. Después, la cola continúa en servidor aunque se cierre el navegador. Los originales quedan privados antes de iniciar la extracción.
4. Revisar y corregir campos, impuestos, categoría, centro de costo y referencias. Datos ilegibles quedan sin completar; no se inventa fecha ni total. Los XML se interpretan sin llamar a Gemini; su lectura no valida firma ni aceptación del SII.
5. Guardar comprobantes revisados. Se conservan extracción original, comentarios y auditoría de cambios. Emisor, tipo y folio detectan duplicados dentro de cada empresa.
6. Preparar la rendición mensual, anual o por rango. El ZIP divide la plantilla en grupos de 25 y agrega Excel completo, índice con IDs y huella de plantilla y, opcionalmente, originales. Se preservan otras partes de XLSX/XLSM; las fórmulas se recalculan al abrir en Excel. Revisar las fórmulas de la plantilla para impuestos especiales/exentos/retenciones: el Excel completo contiene los montos documentados.
7. Exportar registra una instantánea y estado **Exportado**; no marca **Declarado**. Se puede cerrar/reabrir cada mes. La conciliación RCV compara un CSV descargado por el contador; no inicia sesión ni declara ante el SII.

## Saldo y cobro

Cada cuenta recibe 30 créditos iniciales, una sola vez. Imagen = 1 crédito; PDF = 1 por página; XML = 1 por DTE. El servidor reserva saldo al encolar, cobra una vez al entregar extracción para revisión y libera la reserva ante fallo definitivo. Corregir y exportar no consumen saldo. La recarga no es una suscripción ilimitada. El precio comercial y la pasarela quedan por definir.

La activación manual significa que el administrador confirma el pago fuera de la app y acredita el paquete usando una referencia única. No significa revisar ni descontar cada documento a mano. Repetir la misma referencia y cantidad es seguro; cambiar su destinatario o cantidad se rechaza.

```sh
node --env-file=.env.worker scripts/credit-topup.mjs UUID_CONTADOR 500 REFERENCIA_UNICA_DEL_PAGO
```

Este comando requiere la clave secreta del servidor. No se entrega a contadores ni se implementa como formulario público. Una pasarela futura deberá invocar la misma operación desde un webhook autenticado, tras verificar importe, moneda y estado del pago.

## Despliegue coordinado

La migración cambia RLS y desactiva el antiguo `/api/extract` (410). No publicar únicamente el frontend ni aplicar la migración sobre producción sin coordinar el cambio. La versión antigua y la nueva no son intercambiables.

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

Tarifas configurables mediante `GEMINI_INPUT_USD_PER_MILLION` y `GEMINI_OUTPUT_USD_PER_MILLION`; verificar precios actuales antes de operar. Valores iniciales para Gemini 2.5 Flash: 0,30 y 2,50. El registro de intentos conserva modelo, tokens de entrada/salida/razonamiento, tiempo y costo estimado.

## Verificación incluida

`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:server`, `pnpm test:db`, `pnpm build`. La base de pruebas PGlite ejecuta SQL real con roles/RLS y todas las migraciones; no reproduce Storage, Auth ni infraestructura distribuida de Supabase. Los smoke tests de CI comprueban portada/login/rutas públicas y protegidas. Las pruebas de exportación cubren 25, 26 y 100 documentos, notas de crédito, fórmulas y conservación de partes binarias.

## Límites y siguientes etapas

Quedan fuera de esta entrega la pasarela automática (requiere proveedor/cuenta comercial), invitaciones a asistentes del contador, Batch API diferida, correo entrante, conciliación bancaria, extracción local de texto PDF y una evaluación de precisión con documentos representativos autorizados. El cambio de enfoque solicitado concentra los permisos en el contador propietario. La restauración de ZIP históricos debe hacerse mediante una migración revisada: se retiró el formulario antiguo que podía mezclar empresas y fallar al restaurar originales. Los ajustes globales históricos no se copian indiscriminadamente entre empresas.

Antes de ofrecer grandes volúmenes: retención y precios de almacenamiento, paginación/filtrado de comprobantes completamente en servidor, métricas de tiempo de revisión/primera exportación y un ensayo de carga concurrente en staging. La lista actual pagina la descarga para evitar el corte de 1.000 filas, pero mantiene los documentos de la empresa en memoria del navegador.

Referencias: [cuotas Gemini](https://ai.google.dev/gemini-api/docs/rate-limits), [facturación](https://ai.google.dev/gemini-api/docs/billing), [precios](https://ai.google.dev/gemini-api/docs/pricing), [condiciones](https://ai.google.dev/gemini-api/terms).
