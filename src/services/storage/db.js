import Dexie from 'dexie';

/**
 * Instancia Dexie para la base de datos local.
 * Schema versionado para facilitar migraciones futuras.
 */
const db = new Dexie('boletas-saludent-db');

db.version(1).stores({
  // Tabla principal de comprobantes
  invoices: 'id, date, providerName, providerRut, documentType, expenseType, status, createdAt',
  // Imágenes almacenadas como Blob, vinculadas por invoiceId
  images: 'id',
  // Configuración de la app (API keys, preferencias)
  settings: 'key',
});

export default db;
