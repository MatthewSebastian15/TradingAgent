import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  readHttpError: async (res) => `HTTP ${res.status}`,
}));

import { fetchGeneralNews, requestGeneralNewsRefresh } from './generalNewsApi';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchGeneralNews', () => {
  it('GETs /news/general with category, window and limit', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ articles: [{ id: 'n1' }] }),
    });

    const result = await fetchGeneralNews({ category: 'tech', windowDays: 3, limit: 20 });

    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/news/general?category=tech&window_days=3&limit=20'
    );
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('GET');
    expect(result.articles).toEqual([{ id: 'n1' }]);
    expect(result.articles_found).toBe(1);
  });

  it('normalizes alternate article array keys', async () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ id: 'a' }, { id: 'b' }] }),
    });
    const result = await fetchGeneralNews();
    expect(result.articles).toHaveLength(2);
    expect(result.articles_found).toBe(2);
  });

  it('defaults articles to empty array on odd payloads', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ weird: true }) });
    const result = await fetchGeneralNews();
    expect(result.articles).toEqual([]);
    expect(result.articles_found).toBe(0);
  });

  it('POSTs the refresh endpoint when forceRefresh is set', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ articles: [] }) });

    await fetchGeneralNews({ forceRefresh: true });

    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/news/general/refresh?category=all&window_days=7&limit=100'
    );
    expect(globalThis.fetch.mock.calls[0][1].method).toBe('POST');
    expect(globalThis.fetch.mock.calls[0][1].cache).toBe('no-store');
  });

  it('throws an error carrying the HTTP status', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchGeneralNews()).rejects.toMatchObject({ status: 503 });
  });
});

describe('requestGeneralNewsRefresh', () => {
  it('throws with status on refresh failure', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(requestGeneralNewsRefresh()).rejects.toMatchObject({ status: 429 });
  });
});
