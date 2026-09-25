import { supabase } from "./supabaseClient";
let active = null;
let generation = 0;
export const getWorkspaceGeneration = () => generation;
export function setActiveOrganization(company) {
  generation += 1;
  active = company;
}
export function clearActiveOrganization() {
  setActiveOrganization(null);
}
export async function getActiveOrganization() {
  return active;
}
export function requireCompany() {
  if (!active || active.archived)
    throw new Error("Selecciona una empresa activa en tu cartera.");
  return { ...active };
}
export async function listCompanies(userId) {
  const { data, error } = await supabase
    .from("organizations")
    .select("*")
    .eq("accountant_id", userId)
    .order("name");
  if (error) throw error;
  return data;
}
