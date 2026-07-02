import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  readHttpError: async (res) => `HTTP ${res.status}`,
}));

import { fetchTickerNews } from './tickerNewsApi';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchTickerNews', () => {
  it('builds the per-ticker URL with default window and limit', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ articles: [] }) });

    await fetchTickerNews({ ticker: 'BBCA.JK' });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/news/BBCA.JK?window_days=30&limit=30',
      expect.objectContaining({ method: 'GET', credentials: 'include' })
    );
  });

  it('adds provider and force_refresh when requested', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    await fetchTickerNews({
      ticker: 'AAPL',
      windowDays: 7,
      limit: 10,
      provider: 'finnhub',
      forceRefresh: true,
    });

    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/news/AAPL?window_days=7&limit=10&provider=finnhub&force_refresh=true'
    );
  });

  it('returns the parsed payload', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ articles: [{ id: 'n1' }] }),
    });
    expect(await fetchTickerNews({ ticker: 'AAPL' })).toEqual({ articles: [{ id: 'n1' }] });
  });

  it('throws mapped error on non-ok response', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(fetchTickerNews({ ticker: 'AAPL' })).rejects.toThrow('HTTP 429');
  });
});
