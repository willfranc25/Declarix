export const IMAGE_UPLOAD_LIMIT = 50 * 1024 * 1024;
export const DOCUMENT_UPLOAD_LIMIT = 20 * 1024 * 1024;
export const uploadLimit = mime => /^image\/(jpeg|png|webp)$/.test(mime || '') ? IMAGE_UPLOAD_LIMIT : DOCUMENT_UPLOAD_LIMIT;
export const documentMimeType = file => file.type || (/\.xml$/i.test(file.name) ? 'application/xml' : '');
