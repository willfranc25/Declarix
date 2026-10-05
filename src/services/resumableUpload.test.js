import { test, expect } from 'vitest';
import { uploadResumable } from './resumableUpload';
import { uploadLimit, documentMimeType } from '../utils/uploadLimits';

test('signed TUS uses direct storage endpoint, 6 MiB chunks and retry delays', async () => {
  let config, uploaded;
  const file = new Blob(['unchanged original']);
  await uploadResumable(file, { token: 'scoped-token', path: 'owner/company/job' }, 'image/jpeg', {
    storageUrl: 'https://example.supabase.co',
    loadTus: async () => ({ Upload: class { constructor(input, options) { uploaded = input; config = options; } start() { config.onSuccess(); } } }),
  });
  expect(uploaded).toBe(file);
  expect(config.endpoint).toBe('https://example.storage.supabase.co/storage/v1/upload/resumable');
  expect(config.headers).toEqual({ 'x-signature': 'scoped-token' });
  expect(config.chunkSize).toBe(6 * 1024 * 1024);
  expect(config.retryDelays).toEqual([0, 1000, 3000, 5000, 10000]);
  expect(config.metadata).toMatchObject({ bucketName: 'documents', objectName: 'owner/company/job', contentType: 'image/jpeg' });
});

test('failed upload rejects instead of acknowledging success', async () => {
  await expect(uploadResumable(new Blob(['image']), { token: 'token', path: 'path' }, 'image/jpeg', {
    storageUrl: 'https://example.storage.supabase.co',
    loadTus: async () => ({ Upload: class { constructor(input, options) { this.options = options; } start() { this.options.onError(); } } }),
  })).rejects.toThrow('varios reintentos');
});

test('image allowance is 50 MiB; PDF/XML keep the 20 MiB bound', () => {
  expect(uploadLimit('image/jpeg')).toBe(50 * 1024 * 1024);
  expect(uploadLimit('image/png')).toBe(50 * 1024 * 1024);
  expect(uploadLimit('application/pdf')).toBe(20 * 1024 * 1024);
  expect(documentMimeType({ name: 'boleta.XML', type: '' })).toBe('application/xml');
});
