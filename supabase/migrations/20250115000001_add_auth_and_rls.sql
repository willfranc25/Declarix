-- ============================================================
-- MIGRACIÓN: Autenticación + RLS para invoices (ajustado a camelCase)
-- Ejecutar en Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Habilitar extensión para UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Añadir user_id a invoices (si no existe)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- 3. Añadir columnas de estado tributario y control de sync
-- (usando camelCase para coincidir con columnas existentes)
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS "taxStatus" TEXT DEFAULT 'pending' 
    CHECK ("taxStatus" IN ('pending', 'reviewed', 'declared'));

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT FALSE;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS "imagePath" TEXT;

ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS "lastModifiedBy" TEXT;

-- 4. Poblar user_id para datos existentes 
-- REEMPLAZA 'TU_USER_ID_AQUI' con tu verdadero user_id de Authentication → Users
-- UPDATE public.invoices SET user_id = 'TU_USER_ID_AQUI' WHERE user_id IS NULL;

-- 5. Hacer user_id NOT NULL (después de poblar)
-- ALTER TABLE public.invoices ALTER COLUMN user_id SET NOT NULL;

-- 6. Índices para performance (usando nombres de columnas reales)
CREATE INDEX IF NOT EXISTS idx_invoices_user_date 
    ON public.invoices(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_user_taxstatus 
    ON public.invoices(user_id, "taxStatus");
CREATE INDEX IF NOT EXISTS idx_invoices_user_providerrut 
    ON public.invoices(user_id, "providerRut");
CREATE INDEX IF NOT EXISTS idx_invoices_user_deleted 
    ON public.invoices(user_id, deleted) WHERE deleted = FALSE;

-- 7. HABILITAR RLS (Row Level Security)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- 8. POLÍTICAS RLS - Cada usuario solo ve SUS facturas
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices" ON public.invoices
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
CREATE POLICY "Users can insert own invoices" ON public.invoices
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
CREATE POLICY "Users can update own invoices" ON public.invoices
    FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;
CREATE POLICY "Users can delete own invoices" ON public.invoices
    FOR DELETE USING (auth.uid() = user_id);

-- 9. Tabla mappings (para mapping Saludent por empresa)
CREATE TABLE IF NOT EXISTS public.mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "rutEmpresa" TEXT NOT NULL,
    mapping JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, "rutEmpresa")
);
CREATE INDEX IF NOT EXISTS idx_mappings_user ON public.mappings(user_id);
ALTER TABLE public.mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own mappings" ON public.mappings
    FOR ALL USING (auth.uid() = user_id);

-- 10. Tabla templates (plantillas .xlsm)
CREATE TABLE IF NOT EXISTS public.templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "fileData" BYTEA,
    "storagePath" TEXT,
    "isDefault" BOOLEAN DEFAULT FALSE,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, name)
);
CREATE INDEX IF NOT EXISTS idx_templates_user ON public.templates(user_id);
ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own templates" ON public.templates
    FOR ALL USING (auth.uid() = user_id);

-- 11. Trigger updated_at automático
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW."updatedAt" = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_invoices_updated_at ON public.invoices;
CREATE TRIGGER trigger_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_mappings_updated_at ON public.mappings;
CREATE TRIGGER trigger_mappings_updated_at
    BEFORE UPDATE ON public.mappings
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_templates_updated_at ON public.templates;
CREATE TRIGGER trigger_templates_updated_at
    BEFORE UPDATE ON public.templates
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- 12. Función para obtener user_id actual
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
    SELECT auth.uid();
$$;

-- ============================================================
-- DESPUÉS DE EJECUTAR:
-- 1. Ve a Authentication → Users → copia tu User ID
-- 2. Ejecuta: UPDATE public.invoices SET user_id = 'TU_USER_ID' WHERE user_id IS NULL;
-- 3. Ejecuta: ALTER TABLE public.invoices ALTER COLUMN user_id SET NOT NULL;
-- ============================================================