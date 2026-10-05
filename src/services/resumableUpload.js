// The server token authorizes exactly one new object, without exposing service keys.
export async function uploadResumable(file, prepared, mimeType, {
  storageUrl = import.meta.env.VITE_SUPABASE_URL,
  loadTus = () => import('tus-js-client'),
} = {}) {
  const { Upload } = await loadTus();
  const url = new URL(storageUrl);
  if (url.hostname.endsWith('.supabase.co') && !url.hostname.endsWith('.storage.supabase.co'))
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co');
  url.pathname = '/storage/v1/upload/resumable'; url.search = ''; url.hash = '';
  await new Promise((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint: url.toString(),
      headers: { 'x-signature': prepared.token },
      chunkSize: 6 * 1024 * 1024,
      retryDelays: [0, 1000, 3000, 5000, 10000],
      uploadDataDuringCreation: true,
      storeFingerprintForResuming: false,
      metadata: { bucketName: 'documents', objectName: prepared.path, contentType: mimeType, cacheControl: '3600' },
      onError: () => reject(new Error('La carga se interrumpió tras varios reintentos. Vuelve a elegir el archivo para subirlo.')),
      onSuccess: resolve,
    });
    upload.start();
  });
}
