import indexedDBProvider from './indexedDBProvider';

/**
 * StorageProvider — Factory que selecciona el proveedor de almacenamiento.
 *
 * Hoy: IndexedDB local (Dexie).
 * Futuro: Supabase remoto cuando haya credenciales configuradas.
 *
 * Ambos proveedores implementan la misma interfaz:
 *   initialize(), getAll(), getById(), save(), update(), delete(),
 *   saveImage(), getImage(), deleteImage(),
 *   getSetting(), saveSetting(), clearAll(), importInvoice()
 */

import supabaseProvider from './supabaseProvider';

let currentProvider = null;

export function getStorageProvider() {
  if (currentProvider) return currentProvider;

  // Detectar si hay credenciales Supabase configuradas
  const hasSupabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (hasSupabase) {
    currentProvider = supabaseProvider;
  } else {
    currentProvider = indexedDBProvider;
  }
  
  return currentProvider;
}

/**
 * Permite cambiar el provider en runtime (ej: cuando el usuario configura Supabase).
 */
export function setStorageProvider(provider) {
  currentProvider = provider;
}

export default getStorageProvider;
