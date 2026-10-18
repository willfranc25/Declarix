# Operación de cargas, capacidad y respaldos

## Cargas

`uploaded` espera confirmación explícita; `queued` y `processing` representan
extracción en curso; `ready` espera revisión humana. `saved` incluye trabajos
cuyos resultados fueron guardados o descartados explícitamente. No inferir
pérdida de datos solo por un job `saved` sin invoice: comprobar `_dismissed`.

Antes de reprocesar un lote, identificar sus IDs, empresa y propietario; revisar
estado, intentos, errores, reservas y presencia/tamaño de sus originales. Usar la
confirmación idempotente existente, primero con un archivo controlado; después
verificar la ejecución real y el consumo antes de confirmar el resto autorizado.
Nunca guardar ni declarar automáticamente resultados que requieren revisión.

`scripts/monitoring.sql` contiene consultas de lectura para estado/edad de cola,
reservas, cuota, originales y cron. Un sondeo cron exitoso no prueba una petición
HTTP ni una extracción: contrastar intentos y resultados de jobs.

## Capacidad

`accountant_accounts.storage_limit_bytes` es una cuota de la aplicación, distinta
del límite de Supabase. `storage_bytes` cuenta originales nuevos; las imágenes
legacy y los derivados también ocupan espacio real en el proveedor. Conciliar
ambos niveles antes de modificar una cuota. Alertar al 80 % y 90 % en ambos.

Ampliar solo la cuenta autorizada mediante comparación del valor anterior,
dejando margen para derivados y el resto de la organización. No modificar la
cuota predeterminada ni contratar servicios para resolver una sola cuenta.
Archivar un comprobante no libera espacio. Limpiar únicamente cargas canceladas
o abandonadas sin referencias, por las operaciones existentes y su retención.
No borrar originales guardados o descartados para recuperar capacidad sin un
alcance de retención acordado y una copia recuperable.

## Migraciones

Los nombres de archivo deben coincidir con las versiones aplicadas en
`supabase_migrations.schema_migrations`. Comparar el SQL completo antes de
renombrarlos; un contenido diferente necesita análisis y migración correctiva.
No volver a aplicar una migración ya alojada por una discrepancia de timestamp.

En bases de desarrollo existentes, comparar el historial antes de sincronizar;
no ejecutar `migration repair` indiscriminadamente. Una base nueva usa las
migraciones canónicas en orden y el ensayo `pnpm test:db`.

## Respaldo cifrado

Un artifact de Actions hereda el acceso de lectura del repositorio. No publicar
dumps sin cifrar en repositorios públicos. La configuración del workflow exige:

- Secret `SUPABASE_DB_URL`: conexión de base de datos solo en el runner.
- Archivo `.github/backup-recipients.txt`: clave pública age; nunca la clave privada.

Crear la clave en una máquina segura con `age-keygen -o declarix-recovery.key`.
Guardar la clave privada de recuperación fuera de GitHub y conservar una segunda
copia segura. Registrar solo su clave pública en `.github/backup-recipients.txt` antes de activar el workflow.
El destinatario registrado tiene una identidad de recuperación custodiada por separado.
La prueba de cifrado, descifrado y restauración debe completarse antes de activar
el workflow. Si falta configuración o el destinatario es inválido, el job falla
y no publica artifacts sin cifrar.

El workflow comprueba una restauración de datos aislada y luego publica solo
`.sql.gz.age`. Para ensayar recuperación:

1. Descargar el artifact cifrado a una máquina autorizada.
2. Descifrar con `age -d -i declarix-recovery.key -o backup.sql.gz backup.sql.gz.age`.
3. Ejecutar `pnpm verify:backup backup.sql.gz` en una copia del proyecto.
4. Confirmar recuentos, huellas y relaciones; conservar el informe en privado.

El verificador solo admite dumps de confianza y restaura datos de invoices,
jobs, auditoría, cuentas y metadata de Storage en PGlite. No ejecuta el resto
del dump ni reproduce Auth, RLS, extensiones alojadas o bytes de objetos. Los
recuentos se comparan contra las secciones COPY; las huellas ayudan a comparar
copias, pero no sustituyen un manifest independiente ni un ensayo completo.

Respaldar por separado los bytes de los buckets privados en un destino privado,
con rutas, tamaños y SHA-256. Ensayar descarga y restauración junto con Auth/RLS
y aplicación en staging. Custodiar las copias históricas antes de retirarlas de
destinos compartidos. No introducir dumps, claves ni informes de producción en Git.
