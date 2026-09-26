import { beforeEach, describe, expect, it, vi } from 'vitest';
import JSZip from 'jszip';

const { getStorageProvider, getWorkspaceGeneration } = vi.hoisted(() => ({
  getStorageProvider: vi.fn(),
  getWorkspaceGeneration: vi.fn(() => 1),
}));

vi.mock('./storage/StorageProvider', () => ({ getStorageProvider }));
vi.mock('./organizationService', () => ({ getWorkspaceGeneration }));
vi.mock('../utils/logger', () => ({ default: { debug: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock('file-saver', () => ({ saveAs: vi.fn() }));

import { importBackup, validateBackupFile } from './backupService.js';

describe('backupService', () => {
  const provider = {
    importInvoice: vi.fn(),
    saveImage: vi.fn(),
    saveSetting: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    getStorageProvider.mockReturnValue(provider);
  });

  it('restores image paths from the archive root and validates image counts', async () => {
    const zip = new JSZip();
    zip.file('invoices.json', JSON.stringify([{ id: 'invoice-1' }]));
    zip.file('images/invoice-1.jpeg', new Uint8Array([1, 2, 3]));
    zip.file('images/unrelated.jpeg', new Uint8Array([4]));
    const file = new File([await zip.generateAsync({ type: 'uint8array' })], 'backup.zip');

    expect(await validateBackupFile(file)).toMatchObject({ valid: true, invoiceCount: 1, imageCount: 2 });
    const result = await importBackup(file);

    expect(provider.importInvoice).toHaveBeenCalledOnce();
    expect(provider.saveImage).toHaveBeenCalledOnce();
    expect(provider.saveImage.mock.calls[0][0]).toBe('invoice-1');
    expect(provider.saveImage.mock.calls[0][1]).toBeInstanceOf(Blob);
    expect(provider.saveImage.mock.calls[0][1].type).toBe('image/jpeg');
    expect(result).toMatchObject({ success: true, invoices: 1, images: 1 });
    expect(result.errors).toHaveLength(1);
  });
});
