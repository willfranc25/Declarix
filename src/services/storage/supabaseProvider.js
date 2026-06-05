import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

const supabaseProvider = {
  async initialize(sampleData = null) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    // Evitamos inyectar sampleData automáticamente en la nube para no llenar la BD real con datos de prueba
  },

  async getAll() {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .order('date', { ascending: false });
    if (error) throw error;
    return data;
  },

  async getById(id) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('id', id)
      .single();
    if (error) return null;
    return data;
  },

  async save(invoiceData) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const now = new Date().toISOString();
    const invoice = {
      id: uuidv4(),
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
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const updatedAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('invoices')
      .update({ ...updates, updatedAt })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async delete(id) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    await supabase.from('invoices').delete().eq('id', id);
    
    // Buscar y borrar imagen asociada si existe
    const { data: files } = await supabase.storage.from('images').list('', { search: id });
    if (files && files.length > 0) {
      await supabase.storage.from('images').remove(files.map(f => f.name));
    }
  },

  async saveImage(invoiceId, blob) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
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
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const { data: files } = await supabase.storage.from('images').list('', { search: invoiceId });
    if (files && files.length > 0) {
      await supabase.storage.from('images').remove(files.map(f => f.name));
    }
  },

  async getSetting(key) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();
    if (error) return null;
    return data.value;
  },

  async saveSetting(key, value) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    const { error } = await supabase.from('settings').upsert({ key, value });
    if (error) throw error;
  },

  async clearAll() {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    // Por seguridad en prod, no permitiremos limpiar todo con un click sin auth, 
    // pero mantenemos la interfaz funcional.
    await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  },

  async importInvoice(invoice) {
    if (!supabase) throw new Error("Configuración de Supabase faltante (.env)");
    await supabase.from('invoices').upsert(invoice);
  },
};

export default supabaseProvider;
