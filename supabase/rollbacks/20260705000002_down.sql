-- ============================================================
-- ROLLBACK de 20260705000002_organizations_rbac_plans.sql
--
-- Restaura el modelo por user_id directo (políticas de la migración
-- 20260705000001). No borra organizaciones ni membresías por defecto:
-- los DROP destructivos van comentados al final.
-- ============================================================

-- 7. Restaurar políticas por user_id directo
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

DROP POLICY IF EXISTS "Users manage own mappings" ON public.mappings;
CREATE POLICY "Users manage own mappings" ON public.mappings
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own templates" ON public.templates;
CREATE POLICY "Users manage own templates" ON public.templates
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own usage" ON public.usage_events;
CREATE POLICY "Users read own usage" ON public.usage_events
    FOR SELECT USING (auth.uid() = user_id);

-- 6/4. Triggers y funciones de organizaciones
DROP TRIGGER IF EXISTS trigger_member_limit ON public.organization_members;
DROP FUNCTION IF EXISTS public.enforce_member_limit();
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP TRIGGER IF EXISTS trigger_organizations_updated_at ON public.organizations;
DROP TRIGGER IF EXISTS trigger_plans_updated_at ON public.plans;

-- 5. Columnas organization_id (se conservan por defecto para no perder
--    la asociación; descomentar para eliminarlas)
-- ALTER TABLE public.invoices DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE public.mappings DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE public.templates DROP COLUMN IF EXISTS organization_id;
-- ALTER TABLE public.usage_events DROP COLUMN IF EXISTS organization_id;
DROP INDEX IF EXISTS public.idx_invoices_org;
DROP INDEX IF EXISTS public.idx_usage_events_org_type_date;

-- 6. Políticas de organizations/organization_members (dependen de los helpers)
DROP POLICY IF EXISTS "Members can view own organization" ON public.organizations;
DROP POLICY IF EXISTS "Users can create organizations" ON public.organizations;
DROP POLICY IF EXISTS "Owner can update organization" ON public.organizations;
DROP POLICY IF EXISTS "Owner can delete organization" ON public.organizations;
DROP POLICY IF EXISTS "Members can view memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Admins can add members" ON public.organization_members;
DROP POLICY IF EXISTS "Owner can update memberships" ON public.organization_members;
DROP POLICY IF EXISTS "Members can be removed" ON public.organization_members;
DROP POLICY IF EXISTS "Authenticated users can read plans" ON public.plans;

-- 3. Helpers (después de que ninguna política los use)
DROP FUNCTION IF EXISTS public.org_created_by(UUID);
DROP FUNCTION IF EXISTS public.is_org_member(UUID);
DROP FUNCTION IF EXISTS public.org_role(UUID);

-- 2/1. Tablas (DESTRUCTIVO: descomentar deliberadamente)
-- DROP TABLE IF EXISTS public.organization_members;
-- DROP TABLE IF EXISTS public.organizations;
-- DROP TABLE IF EXISTS public.plans;
