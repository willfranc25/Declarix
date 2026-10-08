import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
const session = vi.hoisted(() => vi.fn());
vi.mock('./supabaseClient', () => ({ supabase: { auth: { getSession: session } } }));
vi.mock('./resumableUpload', () => ({ uploadResumable: vi.fn() }));
import { documentRequest } from './jobService';

beforeEach(() => {
  session.mockReset().mockResolvedValue({ data: { session: { access_token: 'test-session' } } });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ started: 2 }) }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('extraction confirmation', () => {
  it('sends the selected company and jobs to the authenticated endpoint', async () => {
    expect(await documentRequest('start', { companyId: 'company', jobIds: ['a', 'b'] })).toEqual({ started: 2 });
    expect(fetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ Authorization: 'Bearer test-session' }),
      body: JSON.stringify({ action: 'start', companyId: 'company', jobIds: ['a', 'b'] }),
    }));
  });
  it('surfaces server failures without silently starting work', async () => {
    fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'No tienes acceso a esta empresa.' }) });
    await expect(documentRequest('start', {})).rejects.toThrow('No tienes acceso a esta empresa.');
  });
  it('bounds a stalled session lookup and prevents a late request after timeout', async () => {
    vi.useFakeTimers();
    let release;
    session.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const failure = expect(documentRequest('start', {})).rejects.toThrow('La confirmación tardó demasiado');
    await vi.advanceTimersByTimeAsync(30_000); await failure;
    release({ data: { session: { access_token: 'test-session' } } });
    await Promise.resolve(); expect(fetch).not.toHaveBeenCalled();
  });
  it('aborts a stalled network request and allows a subsequent attempt', async () => {
    vi.useFakeTimers();
    fetch.mockImplementationOnce((_, { signal }) => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const failure = expect(documentRequest('start', {})).rejects.toThrow('pulsa Extraer nuevamente');
    await vi.advanceTimersByTimeAsync(30_000); await failure;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    expect(await documentRequest('start', {})).toEqual({ started: 2 });
  });
});
