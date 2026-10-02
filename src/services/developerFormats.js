import { supabase } from "./supabaseClient";
export async function developerRequest(action, payload = {}, signal) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Inicia sesión nuevamente.");
  const response = await fetch("/api/developer-formats", {
    method: "POST", signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({ ...payload, action }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "No se pudo cargar el panel privado.");
  return data;
}
