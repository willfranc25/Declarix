-- ============================================================
-- ROLLBACK de 20260712000001_single_plan.sql
-- Restaura el modelo multi-plan: cuentas nuevas nacen en 'free' y las
-- organizaciones vuelven a 'free' (los planes antiguos siguen en la tabla).
-- ============================================================

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

UPDATE public.organizations SET plan_id = 'free' WHERE plan_id = 'pro';

-- El plan 'pro' se conserva (histórico); descomentar para eliminarlo:
-- DELETE FROM public.plans WHERE id = 'pro';
