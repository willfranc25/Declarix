import { beforeEach, describe, expect, it, vi } from 'vitest';

const { calls, pageRows } = vi.hoisted(() => ({
  calls: [],
  pageRows: [{ id: 'receipt', providerName: 'Proveedor', date: '2026-09-12',
  totalAmount: 1500, taxStatus: 'reviewed', source_job_id: 'job', createdAt: '2026-09-14T12:00:00Z' }],
}));
vi.mock('../supabaseClient', () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) },
    from(table) {
      const query = {};
      for (const method of ['select', 'eq', 'ilike', 'gte', 'lt', 'like', 'or', 'order', 'in']) {
        query[method] = (...args) => { calls.push({ table, method, args }); return query; };
      }
      query.range = (...args) => {
        calls.push({ table, method: 'range', args });
        return Promise.resolve({ data: pageRows, count: 176, error: null });
      };
      query.then = (resolve) => resolve({ data: [{ id: 'job', created_at: '2026-09-10T09:00:00Z' }], error: null });
      return query;
    },
  },
}));
import provider from './supabaseProvider';
import { setActiveOrganization } from '../organizationService';

beforeEach(() => {
  calls.length = 0;
  setActiveOrganization({ id: 'company', accountant_id: 'user', archived: false });
});

describe('paginated receipt query', () => {
  it('requests only the selected 25 rows and uses the upload job timestamp', async () => {
    const result = await provider.getPage({ page: 2, pageSize: 25, filters: { year: 2026, month: 9, providerSearch: 'Prov' } });
    expect(calls.find((call) => call.table === 'invoices' && call.method === 'range')?.args).toEqual([25, 49]);
    expect(calls.find((call) => call.method === 'select')?.args[1]).toEqual({ count: 'exact' });
    expect(calls.some((call) => call.method === 'ilike' && call.args[1] === '%Prov%')).toBe(true);
    expect(result.total).toBe(176);
    expect(result.rows[0].uploadedAt).toBe('2026-09-10T09:00:00Z');
  });
});
