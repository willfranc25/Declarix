-- ============================================================
-- MIGRACIÓN: Modelo de plan único
--
-- Decisión de producto (2026-07-12): Declarix se vende con UNA sola
-- suscripción que da acceso a todo sin límites de uso. La tabla `plans`
-- se conserva como infraestructura (por si el modelo cambia), pero
-- operacionalmente existe un solo plan activo: 'pro'.
--
--   - Crea el plan 'pro' con TODOS los límites en NULL (= ilimitado).
--     Precio referencial: $14.990 CLP/mes (editable con un UPDATE).
--   - Las cuentas nuevas nacen en 'pro' (se actualiza handle_new_user).
--   - Las organizaciones existentes se migran a 'pro'.
--   - Los planes antiguos quedan en la tabla (histórico), sin uso.
--
-- Idempotente. Rollback: supabase/rollbacks/20260712000001_down.sql
-- Orden: después de 20260705000002_organizations_rbac_plans.sql
-- ============================================================

-- 1. Plan único sin límites
INSERT INTO public.plans (id, name, price_clp, max_users, max_documents_month, max_ai_calls_month, max_storage_mb, max_exports_month, history_months)
VALUES ('pro', 'Suscripción Declarix', 14990, NULL, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    max_users = NULL,
    max_documents_month = NULL,
    max_ai_calls_month = NULL,
    max_storage_mb = NULL,
    max_exports_month = NULL,
    history_months = NULL;

-- 2. Las cuentas nuevas nacen con el plan único
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    new_org UUID;
BEGIN
    INSERT INTO public.organizations (name, plan_id, created_by)
    VALUES (
        COALESCE(NULLIF(NEW.raw_user_meta_data->>'company_name', ''), split_part(NEW.email, '@', 1)),
        'pro',
        NEW.id
    )
    RETURNING id INTO new_org;

    INSERT INTO public.organization_members (organization_id, user_id, role)
    VALUES (new_org, NEW.id, 'owner');

    RETURN NEW;
END;
$$;

-- 3. Migrar todas las organizaciones existentes al plan único
UPDATE public.organizations SET plan_id = 'pro' WHERE plan_id <> 'pro';
