import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  readHttpError: async (res) => `HTTP ${res.status}`,
}));

import { getEconomicData } from './economic';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('getEconomicData', () => {
  it('builds /economic/{source}/{command} with query params', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: [{ date: '2026-01-01', value: 3.1 }] }),
    });

    const result = await getEconomicData('fred', 'cpi', { params: { start: '2025-01-01' } });

    expect(result.data).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/economic/fred/cpi?start=2025-01-01',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('omits the query string when there are no params', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await getEconomicData('fred', 'gdp');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/economic/fred/gdp');
  });

  it('throws mapped error on non-ok response', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 502 });
    await expect(getEconomicData('fred', 'cpi')).rejects.toThrow('HTTP 502');
  });
});
