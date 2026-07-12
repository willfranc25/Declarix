/**
 * Compresión y resize de imágenes en el cliente antes de procesar/subir.
 *
 * Las fotos de celular suelen pesar 3–10 MB; para extraer datos y almacenar
 * un comprobante basta ~1600px por lado en JPEG. Esto reduce el costo de
 * storage, acelera la subida en redes móviles y evita el límite de tamaño
 * del endpoint de IA (~4 MB).
 */

import logger from './logger';

const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_QUALITY = 0.8;
// Bajo este tamaño no vale la pena recomprimir
const SKIP_THRESHOLD_BYTES = 300 * 1024;

export async function compressImage(file, options = {}) {
  const { maxDimension = DEFAULT_MAX_DIMENSION, quality = DEFAULT_QUALITY } = options;

  if (!file?.type?.startsWith('image/') || file.size < SKIP_THRESHOLD_BYTES) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

    // Si la compresión no ayudó (o falló), conservar el original
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch (err) {
    // Formato no soportado por el navegador (p. ej. HEIC): usar el original
    logger.warn('[imageCompression] No se pudo comprimir, se usa el original:', err.message);
    return file;
  }
}
