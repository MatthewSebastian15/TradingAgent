import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  readHttpError: async (res) => `HTTP ${res.status}`,
}));

import {
  clearAnalysisHistory,
  deleteAnalysisHistoryResult,
  fetchAnalysisHistory,
  fetchAnalysisHistoryResult,
} from './analysisHistoryApi';

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe('fetchAnalysisHistory', () => {
  it('builds URL with ticker and limit and returns items', () => {
    globalThis.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ request_id: 'r1' }] }),
    });

    return fetchAnalysisHistory({ ticker: 'AAPL', limit: 5 }).then((items) => {
      expect(items).toEqual([{ request_id: 'r1' }]);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/analysis/history?ticker=AAPL&limit=5',
        expect.objectContaining({ method: 'GET', credentials: 'include' })
      );
    });
  });

  it('omits ticker param when empty and defaults limit to 25', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) });
    await fetchAnalysisHistory();
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/analysis/history?limit=25');
  });

  it('returns [] when payload items is not an array', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    expect(await fetchAnalysisHistory()).toEqual([]);
  });

  it('throws mapped error on non-ok response', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 429 });
    await expect(fetchAnalysisHistory()).rejects.toThrow('HTTP 429');
  });
});

describe('fetchAnalysisHistoryResult', () => {
  it('encodes the request id and returns the payload', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ ticker: 'AAPL' }) });
    const result = await fetchAnalysisHistoryResult('id/with space');
    expect(result).toEqual({ ticker: 'AAPL' });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/analysis/history/id%2Fwith%20space');
  });

  it('throws on non-ok', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 404 });
    await expect(fetchAnalysisHistoryResult('missing')).rejects.toThrow('HTTP 404');
  });
});

describe('deleteAnalysisHistoryResult / clearAnalysisHistory', () => {
  it('sends DELETE for one entry', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ deleted: true }) });
    await deleteAnalysisHistoryResult('r1');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/analysis/history/r1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('sends DELETE for the whole history and throws on failure', async () => {
    globalThis.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(clearAnalysisHistory()).rejects.toThrow('HTTP 500');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/analysis/history',
      expect.objectContaining({ method: 'DELETE' })
    );
  });
});
