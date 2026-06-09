import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper para obtener user_id actual
async function getCurrentUserId() {
  if (!supabase) throw new Error('Configuración de Supabase faltante (.env)');
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Usuario no autenticado');
  return user.id;
}

const supabaseProvider = {
  async initialize(sampleData = null) {
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
    const now = new Date().toISOString();
    const invoice = {
      id: uuidv4(),
      user_id: userId,
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

    // Buscar y borrar imagen asociada si existe
    const { data: files } = await supabase.storage.from('images').list('', { search: id });
    if (files && files.length > 0) {
      await supabase.storage.from('images').remove(files.map(f => f.name));
    }
  },

  async saveImage(invoiceId, blob) {
    if (!supabase) throw new Error('Configuración de Supabase faltante (.env)');
    const fileExt = blob.type ? blob.type.split('/')[1] : 'jpeg';
    const fileName = `${invoiceId}.${fileExt}`;
    const { error } = await supabase.storage.from('images').upload(fileName, blob, { upsert: true });
    if (error) throw error;
  },

  async getImage(invoiceId) {
    if (!supabase) return null;
    const { data: files, error: listError } = await supabase.storage.from('images').list('', { search: invoiceId });
    if (listError || !files || files.length === 0) return null;

    const fileName = files[0].name;
    const { data, error } = await supabase.storage.from('images').download(fileName);
    if (error) return null;
    return data;
  },

  async deleteImage(invoiceId) {
    if (!supabase) throw new Error('Configuración de Supabase faltante (.env)');
    const { data: files } = await supabase.storage.from('images').list('', { search: invoiceId });
    if (files && files.length > 0) {
      await supabase.storage.from('images').remove(files.map(f => f.name));
    }
  },

  // Settings con user_id como prefijo
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
      .upsert({ key: `${userId}:${key}`, value });
    if (error) throw error;
  },

  async clearAll() {
    const userId = await getCurrentUserId();
    await supabase.from('invoices').delete().eq('user_id', userId);
  },

  async importInvoice(invoice) {
    const userId = await getCurrentUserId();
    const { error } = await supabase
      .from('invoices')
      .upsert({ ...invoice, user_id: userId });
    if (error) throw error;
  },
};

export default supabaseProvider;