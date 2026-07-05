import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../supabaseClient';
import { getActiveOrganization } from '../organizationService';

// Helper para obtener user_id actual
async function getCurrentUserId() {
  if (!supabase) throw new Error('Configuración de Supabase faltante (.env)');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Usuario no autenticado');
  return user.id;
}

// Las imágenes viven en una carpeta por usuario: <user_id>/<invoiceId>.<ext>
// (las políticas de storage exigen que el primer segmento sea auth.uid()).
async function findImagePath(userId, invoiceId) {
  const { data: files, error } = await supabase.storage
    .from('images')
    .list(userId, { search: invoiceId });
  if (!error && files && files.length > 0) {
    return `${userId}/${files[0].name}`;
  }
  // Fallback legacy: archivos antiguos guardados en la raíz del bucket
  const { data: legacyFiles } = await supabase.storage
    .from('images')
    .list('', { search: invoiceId });
  if (legacyFiles && legacyFiles.length > 0) {
    return legacyFiles[0].name;
  }
  return null;
}

const supabaseProvider = {
  async initialize() {
    if (!supabase) throw new Error('Configuración de Supabase faltante (.env)');
  },

  async getAll() {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(id) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .single();
    if (error) return null;
    return data;
  },

  async save(invoiceData) {
    const userId = await getCurrentUserId();
    const org = await getActiveOrganization();
    const now = new Date().toISOString();
    const invoice = {
      id: uuidv4(),
      user_id: userId,
      // Solo se incluye si hay organización (BD podría no tener la columna aún)
      ...(org ? { organization_id: org.id } : {}),
      ...invoiceData,
      createdAt: now,
      updatedAt: now,
    };
    const { data, error } = await supabase
      .from('invoices')
      .insert([invoice])
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async update(id, updates) {
    const userId = await getCurrentUserId();
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('invoices')
      .update({ ...updates, updatedAt })
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('invoices')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);
    if (error) throw error;

    const path = await findImagePath(userId, id);
    if (path) {
      await supabase.storage.from('images').remove([path]);
    }
  },

  async saveImage(invoiceId, blob) {
    const userId = await getCurrentUserId();
    const fileExt = blob.type ? blob.type.split('/')[1] : 'jpeg';
    const path = `${userId}/${invoiceId}.${fileExt}`;
    const { error } = await supabase.storage.from('images').upload(path, blob, { upsert: true });
    if (error) throw error;
  },

  async getImage(invoiceId) {
    if (!supabase) return null;
    const userId = await getCurrentUserId();
    const path = await findImagePath(userId, invoiceId);
    if (!path) return null;

    const { data, error } = await supabase.storage.from('images').download(path);
    if (error) return null;
    return data;
  },

  async deleteImage(invoiceId) {
    const userId = await getCurrentUserId();
    const path = await findImagePath(userId, invoiceId);
    if (path) {
      await supabase.storage.from('images').remove([path]);
    }
  },

  // Settings: clave con prefijo de usuario + columna user_id (exigida por RLS)
  async getSetting(key) {
    const userId = await getCurrentUserId();
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', `${userId}:${key}`)
      .single();
    if (error) return null;
    return data.value;
  },

  async saveSetting(key, value) {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('settings')
      .upsert({ key: `${userId}:${key}`, value, user_id: userId });
    if (error) throw error;
  },

  async clearAll() {
    const userId = await getCurrentUserId();
    const { error } = await supabase.from('invoices').delete().eq('user_id', userId);
    if (error) throw error;

    // Borrar también las imágenes del usuario para no dejar huérfanas
    const { data: files } = await supabase.storage.from('images').list(userId, { limit: 1000 });
    if (files && files.length > 0) {
      await supabase.storage.from('images').remove(files.map((f) => `${userId}/${f.name}`));
    }
  },

  async importInvoice(invoice) {
    const userId = await getCurrentUserId();
    const org = await getActiveOrganization();
    const { error } = await supabase
      .from('invoices')
      .upsert({ ...(org ? { organization_id: org.id } : {}), ...invoice, user_id: userId });
    if (error) throw error;
  },
};

export default supabaseProvider;
