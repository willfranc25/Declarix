import logger from '../../utils/logger';
import Dexie from 'dexie';

/**
 * Instancia Dexie para la base de datos local.
 * Schema versionado para facilitar migraciones futuras.
 */
const DB_NAME = 'declarix-db';
// Nombre histórico de la base (branding anterior). Se migra una sola vez.
const LEGACY_DB_NAME = 'boletas-saludent-db';
const MIGRATION_MARKER = 'legacy_db_migrated';

const db = new Dexie(DB_NAME);

db.version(1).stores({
  // Tabla principal de comprobantes
  invoices: 'id, date, providerName, providerRut, documentType, expenseType, status, createdAt',
  // Imágenes almacenadas como Blob, vinculadas por invoiceId
  images: 'id',
  // Configuración de la app (preferencias)
  settings: 'key',
});

db.version(2).stores({
  invoices: 'id, date, providerName, providerRut, documentType, expenseType, status, createdAt',
  images: 'id',
  settings: 'key',
  // Cola de extracción/revisión: persiste el archivo (Blob), los datos
  // extraídos y las correcciones del usuario para que cerrar la ventana
  // o la sesión no pierda el progreso de revisión.
  uploadQueue: 'id, addedAt',
});

/**
 * Copia los datos de la base legacy a la nueva la primera vez que se abre.
 * La base antigua se conserva como respaldo (no se elimina).
 * `db.on('ready')` bloquea las queries hasta que la migración termina.
 */
db.on('ready', async () => {
  try {
    const alreadyMigrated = await db.settings.get(MIGRATION_MARKER);
    if (alreadyMigrated) return;

    const legacyExists = await Dexie.exists(LEGACY_DB_NAME);
    if (legacyExists) {
      // Modo dinámico: abre la base existente sin declarar schema
      const legacy = new Dexie(LEGACY_DB_NAME);
      await legacy.open();

      const tableNames = legacy.tables.map((t) => t.name);
      if (tableNames.includes('invoices')) {
        await db.invoices.bulkPut(await legacy.table('invoices').toArray());
      }
      if (tableNames.includes('images')) {
        await db.images.bulkPut(await legacy.table('images').toArray());
      }
      if (tableNames.includes('settings')) {
        await db.settings.bulkPut(await legacy.table('settings').toArray());
      }
      legacy.close();
    }

    await db.settings.put({ key: MIGRATION_MARKER, value: new Date().toISOString() });
  } catch (err) {
    // No bloquear la app: la base legacy sigue intacta para reintentar
    logger.error('[db] Falló la migración de datos locales:', err);
  }
});

export default db;
