import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { getStorageProvider } from './storage/StorageProvider';

/**
 * Exporta todos los datos (comprobantes + imágenes + settings) a un archivo ZIP
 */
export async function exportBackup() {
  const storage = getStorageProvider();
  const zip = new JSZip();

  try {
    // 1. Obtener todos los comprobantes
    const invoices = await storage.getAll();
    console.log(`Exportando ${invoices.length} comprobantes...`);

    // 2. Agregar JSON de comprobantes
    zip.file('invoices.json', JSON.stringify(invoices, null, 2));

    // 3. Obtener y agregar settings
    const settings = {};
    try {
      const storageProvider = getStorageProvider();
      // Settings keys conocidos
      const keys = ['vlm_provider', 'vlm_api_key'];
      for (const key of keys) {
        const value = await storageProvider.getSetting(key);
        if (value) settings[key] = value;
      }
      // También buscar mappings de Saludent
      for (const inv of invoices) {
        if (inv.providerRut) {
          const mappingKey = `saludent_mapping_${inv.providerRut.replace(/[.-]/g, '')}`;
          const mapping = await storageProvider.getSetting(mappingKey);
          if (mapping) settings[mappingKey] = mapping;
        }
      }
    } catch (e) {
      console.warn('No se pudieron exportar todos los settings:', e);
    }
    zip.file('settings.json', JSON.stringify(settings, null, 2));

    // 4. Agregar imágenes (paralelo con límite)
    const imagesFolder = zip.folder('images');
    let imgCount = 0;
    for (const inv of invoices) {
      try {
        const blob = await storage.getImage(inv.id);
        if (blob) {
          const ext = blob.type.split('/')[1] || 'jpeg';
          imagesFolder.file(`${inv.id}.${ext}`, blob);
          imgCount++;
        }
      } catch (e) {
        console.warn(`Error exportando imagen de ${inv.id}:`, e);
      }
    }

    // 5. Metadata del backup
    const metadata = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      app: 'Saludent - Gestor de Boletas',
      invoiceCount: invoices.length,
      imageCount: imgCount,
      settingsKeys: Object.keys(settings).length
    };
    zip.file('metadata.json', JSON.stringify(metadata, null, 2));

    // 6. Generar y descargar ZIP
    const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const filename = `saludent-backup-${new Date().toISOString().split('T')[0]}.zip`;
    saveAs(content, filename);

    return { success: true, filename, invoices: invoices.length, images: imgCount };
  } catch (error) {
    console.error('Error en exportBackup:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Importa datos desde un archivo ZIP de backup
 * @param {File} zipFile - Archivo .zip seleccionado por el usuario
 * @param {Object} options - { overwrite: boolean, importImages: boolean, importSettings: boolean }
 */
export async function importBackup(zipFile, options = { overwrite: true, importImages: true, importSettings: true }) {
  const storage = getStorageProvider();
  const zip = new JSZip();

  try {
    const content = await zip.loadAsync(zipFile);
    const results = { invoices: 0, images: 0, settings: 0, errors: [] };

    // 1. Leer metadata (opcional)
    let metadata = null;
    if (content.files['metadata.json']) {
      try {
        metadata = JSON.parse(await content.files['metadata.json'].async('text'));
        console.log('Backup metadata:', metadata);
      } catch (e) {
        console.warn('No se pudo leer metadata:', e);
      }
    }

    // 2. Importar settings
    if (options.importSettings && content.files['settings.json']) {
      try {
        const settings = JSON.parse(await content.files['settings.json'].async('text'));
        for (const [key, value] of Object.entries(settings)) {
          await storage.saveSetting(key, value);
          results.settings++;
        }
        console.log(`Importados ${results.settings} settings`);
      } catch (e) {
        results.errors.push(`Settings: ${e.message}`);
      }
    }

    // 3. Importar comprobantes
    if (content.files['invoices.json']) {
      try {
        const invoices = JSON.parse(await content.files['invoices.json'].async('text'));
        console.log(`Importando ${invoices.length} comprobantes...`);

        for (const inv of invoices) {
          try {
            // Verificar si ya existe (por RUT + Nº doc + fecha)
            const existing = await storage.getById ? await storage.getById(inv.id) : null;
            // Como no tenemos getById fácilmente, usamos importInvoice (upsert)
            await storage.importInvoice(inv);
            results.invoices++;
          } catch (e) {
            results.errors.push(`Factura ${inv.id}: ${e.message}`);
          }
        }
        console.log(`Importados ${results.invoices} comprobantes`);
      } catch (e) {
        results.errors.push(`Invoices JSON: ${e.message}`);
      }
    }

    // 4. Importar imágenes
    if (options.importImages) {
      const imagesFolder = content.folder('images');
      if (imagesFolder) {
        for (const [filename, file] of Object.entries(imagesFolder.files)) {
          try {
            const blob = await file.async('blob');
            const invoiceId = filename.replace(/\.[^.]+$/, '');
            await storage.saveImage(invoiceId, blob);
            results.images++;
          } catch (e) {
            results.errors.push(`Imagen ${filename}: ${e.message}`);
          }
        }
        console.log(`Importadas ${results.images} imágenes`);
      }
    }

    return { success: true, ...results };
  } catch (error) {
    console.error('Error en importBackup:', error);
    return { success: false, error: error.message, ...results };
  }
}

/**
 * Valida un archivo ZIP antes de importar
 */
export async function validateBackupFile(zipFile) {
  const zip = new JSZip();
  try {
    const content = await zip.loadAsync(zipFile);
    const hasInvoices = !!content.files['invoices.json'];
    const hasMetadata = !!content.files['metadata.json'];
    const invoiceCount = hasInvoices ? JSON.parse(await content.files['invoices.json'].async('text')).length : 0;

    return {
      valid: hasInvoices,
      hasMetadata,
      invoiceCount,
      files: Object.keys(content.files).length
    };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}