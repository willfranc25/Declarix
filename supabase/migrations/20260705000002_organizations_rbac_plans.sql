-- ============================================================
-- MIGRACIÓN: Organizaciones + RBAC + Planes (Fase 2 SaaS)
--
-- Qué introduce:
--   1. Tabla `plans` con límites CONFIGURABLES en BD (no hardcodeados).
--   2. `organizations` + `organization_members` con roles:
--      owner | admin | contador | colaborador | lector.
--   3. Funciones helper SECURITY DEFINER (evitan recursión de RLS).
--   4. Trigger: al registrarse un usuario se crea su organización
--      personal (plan free) con él como owner. Backfill para usuarios
--      existentes.
--   5. `organization_id` en invoices/mappings/templates/usage_events
--      (nullable: las filas legacy siguen funcionando por user_id).
--   6. Políticas RLS re-escritas para verificar membresía y rol:
--        - lector: solo lectura de datos de la organización
--        - colaborador: crea comprobantes y ve/edita SOLO los propios
--        - contador: lee/edita datos financieros, no gestiona miembros
--        - admin: gestión operativa completa, no facturación (plan)
--        - owner: control total incluida facturación
--   7. Límite de usuarios por organización según el plan (trigger).
--
-- Idempotente. Rollback: supabase/rollbacks/20260705000002_down.sql
-- Orden: después de 20260705000001_fix_rls_settings_storage.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1. Planes con límites configurables (NULL = ilimitado)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    price_clp INTEGER NOT NULL DEFAULT 0,
    max_users INTEGER,
    max_documents_month INTEGER,
    max_ai_calls_month INTEGER,
    max_storage_mb INTEGER,
    max_exports_month INTEGER,
    history_months INTEGER,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.plans (id, name, price_clp, max_users, max_documents_month, max_ai_calls_month, max_storage_mb, max_exports_month, history_months) VALUES
    ('free',          'Gratis',        0,     1,    30,   30,   250,   5,    6),
    ('independiente', 'Independiente', 9900,  1,    200,  200,  2000,  50,   24),
    ('pyme',          'Pyme',          19900, 5,    600,  600,  5000,  NULL, NULL),
    ('contador',      'Contador',      39900, NULL, NULL, NULL, 20000, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read plans" ON public.plans;
CREATE POLICY "Authenticated users can read plans" ON public.plans
    FOR SELECT TO authenticated USING (true);
-- Sin políticas de escritura: los planes se administran con service role.

-- ------------------------------------------------------------
-- 2. Organizaciones y membresías
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    plan_id TEXT NOT NULL DEFAULT 'free' REFERENCES public.plans(id),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'contador', 'colaborador', 'lector')),
    "createdAt" TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);

-- ------------------------------------------------------------
-- 3. Helpers SECURITY DEFINER
--    Las políticas de datos consultan la membresía a través de estas
--    funciones para no disparar recursivamente el RLS de
--    organization_members.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_role(org UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT role FROM public.organization_members
    WHERE organization_id = org AND user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_org_member(org UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT public.org_role(org) IS NOT NULL;
$$;

CREATE OR REPLACE FUNCTION public.org_created_by(org UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT created_by FROM public.organizations WHERE id = org;
$$;

-- ------------------------------------------------------------
-- 4. Alta automática: organización personal por usuario nuevo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    new_org UUID;
BEGIN
    INSERT INTO public.organizations (name, plan_id, created_by)
    VALUES (
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), split_part(NEW.email, '@', 1)),
        'free',
        NEW.id
    )
    RETURNING id INTO new_org;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org, NEW.id, 'owner');

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: organización personal para usuarios existentes sin membresía
DO $$
DECLARE
    u RECORD;
    new_org UUID;
BEGIN
    FOR u IN
        SELECT id, email FROM auth.users au
        WHERE NOT EXISTS (
            SELECT 1 FROM public.organization_members m WHERE m.user_id = au.id
        )
    LOOP
        INSERT INTO public.organizations (name, plan_id, created_by)
        VALUES (split_part(u.email, '@', 1), 'free', u.id)
        RETURNING id INTO new_org;

        INSERT INTO public.organization_members (organization_id, user_id, role)
        VALUES (new_org, u.id, 'owner');
    END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 5. organization_id en tablas de datos (nullable para legacy)
-- ------------------------------------------------------------
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.mappings
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.templates
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;
ALTER TABLE public.usage_events
    ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

-- Backfill: asociar datos existentes a la organización del dueño
UPDATE public.invoices i SET organization_id = m.organization_id
FROM public.organization_members m
WHERE i.organization_id IS NULL AND m.user_id = i.user_id AND m.role = 'owner';

UPDATE public.mappings x SET organization_id = m.organization_id
FROM public.organization_members m
WHERE x.organization_id IS NULL AND m.user_id = x.user_id AND m.role = 'owner';

UPDATE public.templates x SET organization_id = m.organization_id
FROM public.organization_members m
WHERE x.organization_id IS NULL AND m.user_id = x.user_id AND m.role = 'owner';

UPDATE public.usage_events x SET organization_id = m.organization_id
FROM public.organization_members m
WHERE x.organization_id IS NULL AND m.user_id = x.user_id AND m.role = 'owner';

CREATE INDEX IF NOT EXISTS idx_invoices_org ON public.invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_org_type_date
    ON public.usage_events(organization_id, event_type, created_at DESC);

-- ------------------------------------------------------------
-- 6. RLS de organizations / organization_members
-- ------------------------------------------------------------
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view own organization" ON public.organizations;
CREATE POLICY "Members can view own organization" ON public.organizations
    FOR SELECT USING (public.is_org_member(id));

DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
CREATE POLICY "Users can create organizations" ON public.organizations
    FOR INSERT WITH CHECK (auth.uid() = created_by);

-- Solo el owner gestiona la organización (incluye plan/facturación)
DROP POLICY IF EXISTS "Owner can update organization" ON public.organizations;
CREATE POLICY "Owner can update organization" ON public.organizations
    FOR UPDATE
    USING (public.org_role(id) = 'owner')
    WITH CHECK (public.org_role(id) = 'owner');

DROP POLICY IF EXISTS "Owner can delete organization" ON public.organizations;
CREATE POLICY "Owner can delete organization" ON public.organizations
    FOR DELETE USING (public.org_role(id) = 'owner');

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view memberships" ON public.organization_members;
CREATE POLICY "Members can view memberships" ON public.organization_members
    FOR SELECT USING (public.is_org_member(organization_id));

-- Alta de miembros: owner agrega cualquier rol; admin agrega roles no-owner;
-- el creador de la organización puede auto-asignarse owner (bootstrap).
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_members;
CREATE POLICY "Admins can add members" ON public.organization_members
    FOR INSERT WITH CHECK (
        public.org_role(organization_id) = 'owner'
        OR (public.org_role(organization_id) = 'admin' AND role <> 'owner')
        OR (auth.uid() = user_id AND role = 'owner' AND public.org_created_by(organization_id) = auth.uid())
    );

-- Cambios de rol: solo el owner
DROP POLICY IF EXISTS "Owner can update memberships" ON public.organization_members;
CREATE POLICY "Owner can update memberships" ON public.organization_members
    FOR UPDATE
    USING (public.org_role(organization_id) = 'owner')
    WITH CHECK (public.org_role(organization_id) = 'owner');

-- Baja: el owner saca a cualquiera; el admin saca no-owners;
-- cualquier miembro (salvo el owner) puede salir por sí mismo.
DROP POLICY IF EXISTS "Members can be removed" ON public.organization_members;
CREATE POLICY "Members can be removed" ON public.organization_members
    FOR DELETE USING (
        public.org_role(organization_id) = 'owner'
        OR (public.org_role(organization_id) = 'admin' AND role <> 'owner')
        OR (auth.uid() = user_id AND role <> 'owner')
    );

-- Límite de usuarios por organización según el plan
CREATE OR REPLACE FUNCTION public.enforce_member_limit()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    member_limit INTEGER;
    member_count INTEGER;
BEGIN
    SELECT p.max_users INTO member_limit
    FROM public.organizations o
    JOIN public.plans p ON p.id = o.plan_id
    WHERE o.id = NEW.organization_id;

    IF member_limit IS NOT NULL THEN
        SELECT count(*) INTO member_count
        FROM public.organization_members
        WHERE organization_id = NEW.organization_id;

        IF member_count >= member_limit THEN
            RAISE EXCEPTION 'La organización alcanzó el límite de % usuario(s) de su plan', member_limit
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_member_limit ON public.organization_members;
CREATE TRIGGER trigger_member_limit
    BEFORE INSERT ON public.organization_members
    FOR EACH ROW EXECUTE FUNCTION public.enforce_member_limit();

-- ------------------------------------------------------------
-- 7. RLS de datos financieros por membresía y rol
--    Las filas legacy (organization_id NULL) siguen el modelo por
--    user_id directo.
-- ------------------------------------------------------------

-- invoices
DROP POLICY IF EXISTS "Users can view own invoices" ON public.invoices;
CREATE POLICY "Users can view own invoices" ON public.invoices
    FOR SELECT USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador', 'lector'))
        -- colaborador: solo ve su propio trabajo (cubierto por user_id)
    );

DROP POLICY IF EXISTS "Users can insert own invoices" ON public.invoices;
CREATE POLICY "Users can insert own invoices" ON public.invoices
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
        AND (organization_id IS NULL
             OR public.org_role(organization_id) IN ('owner', 'admin', 'contador', 'colaborador'))
    );

DROP POLICY IF EXISTS "Users can update own invoices" ON public.invoices;
CREATE POLICY "Users can update own invoices" ON public.invoices
    FOR UPDATE
    USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    )
    WITH CHECK (
        (auth.uid() = user_id
         OR (organization_id IS NOT NULL
             AND public.org_role(organization_id) IN ('owner', 'admin', 'contador')))
        AND (organization_id IS NULL OR public.is_org_member(organization_id))
    );

DROP POLICY IF EXISTS "Users can delete own invoices" ON public.invoices;
CREATE POLICY "Users can delete own invoices" ON public.invoices
    FOR DELETE USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin'))
    );

-- mappings
DROP POLICY IF EXISTS "Users manage own mappings" ON public.mappings;
CREATE POLICY "Users manage own mappings" ON public.mappings
    FOR ALL
    USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    )
    WITH CHECK (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    );

-- templates
DROP POLICY IF EXISTS "Users manage own templates" ON public.templates;
CREATE POLICY "Users manage own templates" ON public.templates
    FOR ALL
    USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    )
    WITH CHECK (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    );

-- usage_events: el owner/admin/contador ven el consumo de la organización
DROP POLICY IF EXISTS "Users read own usage" ON public.usage_events;
CREATE POLICY "Users read own usage" ON public.usage_events
    FOR SELECT USING (
        auth.uid() = user_id
        OR (organization_id IS NOT NULL
            AND public.org_role(organization_id) IN ('owner', 'admin', 'contador'))
    );

-- ------------------------------------------------------------
-- 8. Triggers updated_at
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON public.organizations;
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trigger_plans_updated_at ON public.plans;
CREATE TRIGGER trigger_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
