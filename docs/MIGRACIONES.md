# Migraciones de base de datos

Fuente de verdad: `supabase/migrations/` (orden por prefijo de timestamp).
La carpeta `migrations/` de la raíz fue eliminada: contenía una copia antigua
con sintaxis SQL inválida en las políticas de UPDATE/DELETE de `invoices`.

## Orden de ejecución

1. `20250115000001_add_auth_and_rls.sql` — user_id + columnas de sync en
   `invoices`, tablas `mappings` y `templates`, RLS inicial.
2. `20260705000001_fix_rls_settings_storage.sql` — tabla `settings` con RLS,
   políticas idempotentes con `WITH CHECK`, bucket `images` privado con
   carpetas por usuario, tabla `usage_events`.
3. `20260705000002_organizations_rbac_plans.sql` — tablas `plans`,
   `organizations`, `organization_members`; roles (owner/admin/contador/
   colaborador/lector); organización personal automática por usuario nuevo
   (trigger sobre `auth.users`) con backfill para usuarios existentes;
   `organization_id` en las tablas de datos; RLS por membresía y rol; límite
   de usuarios por plan. Ver `docs/PLANES.md`.

Ambas son idempotentes (`IF NOT EXISTS` / `DROP POLICY IF EXISTS`): se pueden
re-ejecutar sin efectos secundarios. Ejecutar con `supabase db push` (CLI) o
pegándolas en orden en el SQL Editor del Dashboard.

## Pasos manuales pendientes (una sola vez, con datos productivos a la vista)

1. **Backfill de `user_id` en invoices** (si quedan filas antiguas sin dueño):
   ```sql
   SELECT count(*) FROM public.invoices WHERE user_id IS NULL; -- revisar
   UPDATE public.invoices SET user_id = '<USER_ID>' WHERE user_id IS NULL;
   ALTER TABLE public.invoices ALTER COLUMN user_id SET NOT NULL;
   ```
2. **Settings huérfanos**: la migración hace backfill de `user_id` desde el
   prefijo de `key`. Revisar si quedaron filas sin dueño:
   ```sql
   SELECT key FROM public.settings WHERE user_id IS NULL;
   ```
3. **Imágenes legacy en la raíz del bucket `images`**: los archivos antiguos
   (`<invoiceId>.<ext>` sin carpeta) siguen siendo legibles por el fallback del
   cliente, pero conviene moverlos a `<user_id>/<invoiceId>.<ext>`:
   ```sql
   -- listar objetos en raíz (sin carpeta de usuario)
   SELECT name FROM storage.objects
   WHERE bucket_id = 'images' AND position('/' in name) = 0;
   ```
   Moverlos con el Dashboard o un script usando la service role key
   (`storage.from('images').move(old, `${userId}/${old}`)`).

## Rollback

Cada migración nueva tiene su script inverso en `supabase/rollbacks/` con el
mismo prefijo (`20260705000001_down.sql`). Los rollbacks no borran datos por
defecto; los `DROP TABLE`/`DROP COLUMN` destructivos van comentados y deben
descomentarse deliberadamente.

**Advertencia**: revertir `20260705000001` deja `settings` sin RLS y el bucket
sin políticas — solo usarlo ante una regresión operativa entendiendo el riesgo.

## Estándar para migraciones futuras

- Nombre: `YYYYMMDDHHMMSS_descripcion.sql` en `supabase/migrations/`.
- Idempotente: `IF NOT EXISTS` / `IF EXISTS` / `DROP POLICY IF EXISTS` antes de crear.
- Sin pérdida de datos: nunca `DROP`/`TRUNCATE` sin respaldo y sin aviso en el PR.
- Con rollback: script inverso en `supabase/rollbacks/<mismo prefijo>_down.sql`.
- Comentada: qué corrige y por qué, al inicio del archivo.
- No editar migraciones ya aplicadas: corregir con una migración nueva.
