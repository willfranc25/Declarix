import { supabase } from './supabaseClient';

/**
 * Organización activa del usuario.
 *
 * Hoy cada usuario pertenece a una organización (la personal creada al
 * registrarse) o, en cuentas plan Contador, a varias; se toma la primera
 * donde es owner. Cuando exista el selector de organización en la UI
 * (multi-empresa), este módulo es el único punto a cambiar.
 */

let cachedOrg;
let pendingLoad = null;

export async function getActiveOrganization() {
  if (cachedOrg !== undefined) return cachedOrg;
  if (!supabase) {
    cachedOrg = null;
    return null;
  }

  if (!pendingLoad) {
    pendingLoad = (async () => {
      try {
        const { data, error } = await supabase
          .from('organization_members')
          .select('organization_id, role, organizations(id, name, plan_id)')
          .order('createdAt', { ascending: true });
        if (error || !data || data.length === 0) {
          cachedOrg = null;
          return cachedOrg;
        }
        const active = data.find((m) => m.role === 'owner') || data[0];
        cachedOrg = {
          id: active.organization_id,
          role: active.role,
          name: active.organizations?.name ?? null,
          planId: active.organizations?.plan_id ?? null,
        };
        return cachedOrg;
      } catch (err) {
        // BD sin la migración de organizaciones todavía: operar sin org
        console.warn('[organizationService] No se pudo cargar la organización:', err.message);
        cachedOrg = null;
        return cachedOrg;
      } finally {
        pendingLoad = null;
      }
    })();
  }
  return pendingLoad;
}

/** Limpia el cache (llamar al cerrar sesión o cambiar de usuario). */
export function clearActiveOrganization() {
  cachedOrg = undefined;
  pendingLoad = null;
}
