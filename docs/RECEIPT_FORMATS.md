# Vouchers y diagnóstico de formatos

Un «Comprobante de pago electrónico» sin folio SII usa el texto `0000` en el campo folio, revisión, guardado y exportaciones. Es una convención de Declarix, no un folio emitido por el SII. Una boleta electrónica explícita en el mismo ticket conserva su folio real. Nunca se usan aprobación, terminal ni operación como folio tributario.

La referencia de operación sigue siendo opcional y separada. Los duplicados de vouchers requieren emisor + referencia + fecha + total; sin referencia no se inventa una coincidencia por compartir `0000`. La idempotencia por archivo y resultado de origen sigue activa. Las boletas y facturas mantienen su regla de emisor + tipo + folio.

## Panel privado

Ruta `/developer/formats`, accesible desde el menú de cuenta solo para un desarrollador autorizado. El servidor valida la sesión y consulta `private.developer_accounts` en cada operación. La migración habilita únicamente la cuenta existente y confirmada del propietario. No se usan correos ni metadatos editables del cliente para autorizar solicitudes. Para autorizar otra cuenta, un administrador de base de datos debe insertar su UUID en esa tabla; no existe un endpoint público para hacerlo.

El worker pide en la misma extracción una descripción estructural (marca, procesador, tipo, soporte, rótulo y orden de secciones). El hash de esos atributos agrupa formatos sin folios, RUT, fechas, montos ni texto OCR completo. La descripción se elimina del resultado visible al contador y se guarda mediante una RPC exclusiva del servidor. Es una agrupación aproximada: no garantiza detectar todos los cambios de diseño ni entrena automáticamente al modelo.

Cada documento procesado genera una observación pequeña e idempotente. Los errores de validación, discrepancias de folio, diseños desconocidos, fallos terminales y correcciones manuales señalan formatos a revisar. Un problema nuevo reabre un formato revisado; un formato ignorado permanece ignorado. Se conservan notas, estado, contadores y hasta tres ejemplos por respuesta del panel. Los ejemplos referencian los archivos originales existentes; no se copian a otro bucket. Abrir uno genera un enlace privado de 10 minutos y registra el acceso. Las notas de desarrollo no se aplican como instrucciones de extracción automáticamente.

El catálogo empieza a describir diseños con las nuevas extracciones. Documentos previos no se reprocesan ni se reclasifican silenciosamente. Los vouchers ya identificados en la cola se presentan como `0000` sin modificar sus originales ni las correcciones de otros campos.

## Operación y crecimiento

La migración es aditiva salvo la sustitución de la función de validación de comprobantes, que conserva propiedad, períodos cerrados, montos y origen. Ensayo gratuito: `pnpm test:db` con PostgreSQL embebido PGlite. Pruebas de API verifican denegación a clientes y enlaces temporales; pruebas de extracción verifican agrupación y que el diagnóstico no impida guardar un resultado.

Las tablas están en `private`, con RLS y sin permisos `anon`/`authenticated`. Solo el servidor tiene acceso; las funciones públicas son `security invoker`, con ejecución revocada a clientes. La consulta pagina 25 formatos y usa índices para estados y ejemplos. No se añade una cola, recurso contratado ni llamada de IA separada; la metadata sí agrega unos tokens a la extracción.

Para limitar crecimiento, un administrador puede borrar observaciones de más de 90 días, conservando los contadores históricos del formato y sus últimas tres observaciones; las imágenes siguen sujetas a la política normal de documentos. Esa limpieza requiere operación administrativa y no está programada automáticamente. Eliminar definitivamente un job elimina sus observaciones por FK. Antes de usar el panel con clientes comerciales, mantener la finalidad de diagnóstico de la política de privacidad y la lista de desarrolladores autorizados actualizadas.

## Verificación de seguridad en producción

El asesor de Supabase informa RLS sin políticas en las cuatro tablas privadas: es intencional, porque los clientes no tienen permisos y el único rol operativo es `service_role`. No deben añadirse políticas de lectura para `authenticated` para silenciar esa [observación informativa](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Persisten advertencias del esquema anterior, fuera del catálogo: `handle_updated_at` y `current_user_id` con [search_path mutable](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), cuatro helpers antiguos de organizaciones [security definer ejecutables por anon](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable) y [authenticated](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), y [protección de contraseñas filtradas desactivada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Esta entrega no cambia esas funciones heredadas ni declara una auditoría general de seguridad completada.
