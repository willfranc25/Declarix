import { v4 as uuidv4 } from 'uuid';
import db from './db';

/**
 * IndexedDB storage provider usando Dexie.
 * Implementa la interfaz común del StorageProvider.
 */
const indexedDBProvider = {
  /**
   * Inicializa la BD. Si está vacía, carga datos de ejemplo.
   */
  async initialize(sampleData = null) {
    const count = await db.invoices.count();
    if (count === 0 && sampleData && sampleData.length > 0) {
      await db.invoices.bulkAdd(sampleData);
    }
  },

  /**
   * Obtiene todos los comprobantes ordenados por fecha desc.
   */
  async getAll() {
    return db.invoices.orderBy('date').reverse().toArray();
  },

  /**
   * Obtiene un comprobante por ID.
   */
  async getById(id) {
    return db.invoices.get(id) || null;
  },

  /**
   * Guarda un nuevo comprobante. Genera ID y timestamps automáticamente.
   */
  async save(invoiceData) {
    const now = new Date().toISOString();
    const invoice = {
      id: uuidv4(),
      ...invoiceData,
      createdAt: now,
      updatedAt: now,
    };
    await db.invoices.add(invoice);
    return invoice;
  },

  /**
   * Actualiza un comprobante existente.
   */
  async update(id, updates) {
    const updatedAt = new Date().toISOString();
    await db.invoices.update(id, { ...updates, updatedAt });
    return db.invoices.get(id);
  },

  /**
   * Elimina un comprobante y su imagen asociada.
   */
  async delete(id) {
    await db.invoices.delete(id);
    await db.images.delete(id);
  },

  /**
   * Guarda una imagen como Blob vinculada a un comprobante.
   */
  async saveImage(invoiceId, blob) {
    await db.images.put({ id: invoiceId, blob });
  },

  /**
   * Obtiene la imagen de un comprobante.
   */
  async getImage(invoiceId) {
    const record = await db.images.get(invoiceId);
    return record ? record.blob : null;
  },

  /**
   * Elimina la imagen de un comprobante.
   */
  async deleteImage(invoiceId) {
    await db.images.delete(invoiceId);
  },

  /**
   * Obtiene una configuración por clave.
   */
  async getSetting(key) {
    const record = await db.settings.get(key);
    return record ? record.value : null;
  },

  /**
   * Guarda una configuración.
   */
  async saveSetting(key, value) {
    await db.settings.put({ key, value });
  },

  /**
   * Elimina todos los comprobantes e imágenes.
   */
  async clearAll() {
    await db.invoices.clear();
    await db.images.clear();
  },

  /**
   * Importa un comprobante (upsert por ID).
   */
  async importInvoice(invoice) {
    await db.invoices.put(invoice);
  },
};

export default indexedDBProvider;
