import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearHistory,
  formatHistoryHorizon,
  historyResourceId,
  normalizeBackendHistory,
  readHistory,
  removeHistoryItem,
  saveToHistory,
} from './useAnalysisHistoryStore';

// Passthrough "encryption" so tests exercise the store logic, not WebCrypto.
vi.mock('../services/secureStorage', () => ({
  encryptJSON: async (value) => `ENC:${JSON.stringify(value)}`,
  decryptJSON: async (raw) => (raw.startsWith('ENC:') ? JSON.parse(raw.slice(4)) : null),
}));

const KEY = 'test:history';

function entry(overrides = {}) {
  return {
    job_id: 'job-1',
    ticker: 'AAPL',
    decision: 'BUY',
    saved_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('useAnalysisHistoryStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('save → read round-trips a summary, newest first, deduped by job_id', async () => {
    await saveToHistory(KEY, entry({ job_id: 'job-1', decision: 'HOLD' }));
    await saveToHistory(KEY, entry({ job_id: 'job-2' }));
    await saveToHistory(KEY, entry({ job_id: 'job-1', decision: 'BUY' })); // resave dedupes

    const history = await readHistory(KEY);

    expect(history.map((item) => item.job_id)).toEqual(['job-1', 'job-2']);
    expect(history[0].decision).toBe('BUY');
    expect(localStorage.getItem(KEY)).toMatch(/^ENC:/);
  });

  it('ignores error results and entries without a resource id', async () => {
    await saveToHistory(KEY, { error: 'failed' });
    await saveToHistory(KEY, entry({ job_id: null, request_id: null }));

    expect(await readHistory(KEY)).toEqual([]);
  });

  it('drops expired entries (>30 days) on read', async () => {
    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    await saveToHistory(KEY, entry({ job_id: 'old', saved_at: old }));
    await saveToHistory(KEY, entry({ job_id: 'fresh' }));

    expect((await readHistory(KEY)).map((item) => item.job_id)).toEqual(['fresh']);
  });

  it('reads legacy plaintext arrays and recovers from garbage', async () => {
    localStorage.setItem(KEY, JSON.stringify([entry({ job_id: 'legacy' })]));
    expect((await readHistory(KEY))[0].job_id).toBe('legacy');

    localStorage.setItem(KEY, '{broken');
    expect(await readHistory(KEY)).toEqual([]);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('removeHistoryItem and clearHistory empty the store', async () => {
    await saveToHistory(KEY, entry({ job_id: 'job-1' }));
    await saveToHistory(KEY, entry({ job_id: 'job-2' }));

    await removeHistoryItem(KEY, { job_id: 'job-1' });
    expect((await readHistory(KEY)).map((item) => item.job_id)).toEqual(['job-2']);

    await clearHistory(KEY);
    expect(await readHistory(KEY)).toEqual([]);
  });

  it('normalizeBackendHistory maps created_at fields; helpers behave', () => {
    const createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [normalized] = normalizeBackendHistory([
      { request_id: 'req-9', ticker: 'MSFT', created_at: createdAt },
    ]);
    expect(normalized.request_id).toBe('req-9');
    expect(normalized.analysis_created_at).toBe(createdAt);

    expect(historyResourceId({ request_id: ' req-9 ' })).toBe('req-9');
    expect(formatHistoryHorizon(2)).toBe('2M');
    expect(formatHistoryHorizon(9)).toBeNull();
  });
});
