# Confirmación antes de extraer

1. Seleccionar archivos sube los originales al almacenamiento privado y comprueba su tamaño, formato y hash. Las fotos mantienen su archivo original; la galería usa vistas previas ligeras.
2. Los archivos verificados quedan en `uploaded`, visibles en **Archivos subidos**, sin reservar páginas ni llamar al modelo. Persisten al navegar o recargar. Los archivos incompletos permanecen recuperables en `uploading`.
3. **Cargar boletas** confirma una lista explícita de IDs de la empresa activa. El servidor valida la sesión; `start_uploaded_extractions` verifica cuenta, empresa y propiedad, bloquea las filas y mueve el lote a `queued` en una sola transacción. Una confirmación repetida no vuelve a reservar páginas ni procesar resultados.
4. La extracción se solicita inmediatamente y el despachador programado continúa aunque se cierre la app. Solo reclama archivos en `queued`; nunca los que esperan confirmación.

Se pueden quitar archivos o agregar otros antes de confirmar. La confirmación queda deshabilitada durante una subida. Los fallos muestran nombre y motivo; un archivo incompleto no se incluye al confirmar los demás.

## Compatibilidad y datos existentes

La migración `20261007132035_confirm_receipt_upload.sql` amplía los estados permitidos y cambia `enqueue_extraction` para **solo completar la subida**. Mantiene ese nombre y la acción HTTP `enqueue` como compatibilidad con clientes anteriores. Solo la nueva acción HTTP `start` autoriza la extracción. Reintentar una subida incompleta tampoco inicia el modelo.

Los comprobantes guardados, imágenes originales, trabajos anteriores y sus estados no se reescriben. No se modifica el despachador, la política de almacenamiento ni el registro de consumo interno del proveedor.

## Verificación

- `pnpm test:db`: ensayo gratuito en PGlite sobre datos anteriores; comparación completa antes/después; aislamiento entre cuentas/empresas, lote de 25 subidas, exclusión del worker, confirmación repetida, reversión completa si hay un archivo incompleto y cancelación antes de confirmar.
- `pnpm test:server`: integridad de la subida, compatibilidad con `enqueue`, validación del lote/sesión y vistas previas de archivos verificados.
- `pnpm test`: persistencia de los pendientes, bloqueo de dobles clics/cargas simultáneas, errores y cambio de empresa durante una petición.
