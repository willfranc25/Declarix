-- ============================================================
-- MIGRACIÓN: Cierre de brechas de RLS (Fase 1 SaaS)
--
-- Qué corrige:
--   1. Tabla `settings` (usada por el frontend pero nunca migrada):
--      la crea si falta, le agrega user_id, hace backfill desde el
--      prefijo de `key` y habilita RLS. Sin esto, cualquier usuario
--      autenticado podía leer/escribir settings ajenos (incl. API keys).
--   2. Re-crea TODAS las políticas de invoices/mappings/templates de
--      forma idempotente y con WITH CHECK (antes un usuario podía
--      reasignar el user_id de una fila propia a otro usuario).
--   3. Bucket de storage `images` privado + políticas por carpeta de
--      usuario (`<user_id>/<archivo>`).
--   4. Tabla `usage_events` para registrar consumo (IA, exportaciones)
--      por usuario — base de los límites por plan.
--
-- Idempotente: se puede re-ejecutar sin efectos secundarios.
-- Rollback: supabase/rollbacks/20260705000001_down.sql
-- Orden: después de 20250115000001_add_auth_and_rls.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabla settings con RLS
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settings (
    key TEXT PRIMARY KEY,
    value JSONB,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.settings
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Backfill: las claves existentes tienen formato '<user_uuid>:<clave>'
UPDATE public.settings
SET user_id = split_part(key, ':', 1)::uuid
WHERE user_id IS NULL
  AND key ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:';

-- Filas sin dueño identificable quedan inaccesibles bajo RLS (revisar
-- manualmente antes de borrarlas; ver docs/MIGRACIONES.md).

CREATE INDEX IF NOT EXISTS idx_settings_user ON public.settings(user_id);

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own settings" ON public.settings;
CREATE POLICY "Users manage own settings" ON public.settings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 2. Políticas de invoices (re-creación idempotente + WITH CHECK)
-- ------------------------------------------------------------
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices" ON public.invoices
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
CREATE POLICY "Users can insert own invoices" ON public.invoices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
CREATE POLICY "Users can update own invoices" ON public.invoices
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;
CREATE POLICY "Users can delete own invoices" ON public.invoices
    FOR DELETE USING (auth.uid() = user_id);

-- Mappings y templates: mismas políticas, ahora idempotentes y con WITH CHECK
ALTER TABLE public.mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own mappings" ON public.mappings;
CREATE POLICY "Users manage own mappings" ON public.mappings
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users manage own templates" ON public.templates;
CREATE POLICY "Users manage own templates" ON public.templates
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- ------------------------------------------------------------
-- 3. Storage: bucket `images` privado con carpetas por usuario
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', false)
ON CONFLICT (id) DO UPDATE SET public = false;

-- El primer segmento de la ruta debe ser el uid del usuario:
--   <user_id>/<invoiceId>.<ext>
DROP POLICY IF EXISTS "Users read own images" ON storage.objects;
CREATE POLICY "Users read own images" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users upload own images" ON storage.objects;
CREATE POLICY "Users upload own images" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users update own images" ON storage.objects;
CREATE POLICY "Users update own images" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text)
    WITH CHECK (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users delete own images" ON storage.objects;
CREATE POLICY "Users delete own images" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- 4. usage_events: medición de consumo por usuario
--    Insertado solo por el backend (service role, bypasea RLS).
--    El usuario puede consultar su propio consumo.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.usage_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('ai_extraction', 'export', 'upload')),
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_type_date
    ON public.usage_events(user_id, event_type, created_at DESC);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own usage" ON public.usage_events;
CREATE POLICY "Users read own usage" ON public.usage_events
    FOR SELECT USING (auth.uid() = user_id);
-- Sin política de INSERT/UPDATE/DELETE: solo el service role escribe.

-- ------------------------------------------------------------
-- 5. Trigger updated_at para settings
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_settings_updated_at ON public.settings;
CREATE TRIGGER trigger_settings_updated_at
    BEFORE UPDATE ON public.settings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
