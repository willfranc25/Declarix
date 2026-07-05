-- ============================================================
-- ROLLBACK de 20260705000001_fix_rls_settings_storage.sql
--
-- ADVERTENCIA: revertir esta migración vuelve a dejar `settings`
-- sin RLS (expone API keys entre usuarios) y el bucket `images`
-- sin políticas. Usar solo si la migración causó una regresión
-- operativa y se entiende el riesgo.
--
-- No borra datos: settings, usage_events y los objetos de storage
-- se conservan; solo se retiran políticas/columnas agregadas.
-- ============================================================

-- 5. Trigger de settings
DROP TRIGGER IF EXISTS trigger_settings_updated_at ON public.settings;

-- 4. usage_events (se conserva la tabla por si ya hay datos de consumo;
--    descomentar para eliminarla definitivamente)
DROP POLICY IF EXISTS "Users read own usage" ON public.usage_events;
ALTER TABLE public.usage_events DISABLE ROW LEVEL SECURITY;
-- DROP TABLE IF EXISTS public.usage_events;

-- 3. Políticas de storage
DROP POLICY IF EXISTS "Users read own images" ON storage.objects;
DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Users update own images" ON storage.objects;
DROP POLICY IF EXISTS "Users delete own images" ON storage.objects;
-- (no se revierte el bucket a público: hacerlo manualmente si se requiere)

-- 2. Políticas con WITH CHECK → volver a las versiones de
--    20250115000001 (solo USING)
DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
CREATE POLICY "Users can update own invoices" ON public.invoices
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own mappings" ON public.mappings;
CREATE POLICY "Users manage own mappings" ON public.mappings
    FOR ALL USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own templates" ON public.templates;
CREATE POLICY "Users manage own templates" ON public.templates
    FOR ALL USING (auth.uid() = user_id);

-- 1. settings: retirar RLS y columnas agregadas (la columna user_id se
--    conserva por defecto para no perder el backfill; descomentar para
--    eliminarla)
DROP POLICY IF EXISTS "Users manage own settings" ON public.settings;
ALTER TABLE public.settings DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS public.idx_settings_user;
-- ALTER TABLE public.settings DROP COLUMN IF EXISTS user_id;
