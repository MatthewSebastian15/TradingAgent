import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearTickerSearchCache,
  normalizeTickerSearchCacheKey,
  readTickerSearchCache,
  writeTickerSearchCache,
} from './tickerSearchCache';

describe('tickerSearchCache', () => {
  beforeEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    clearTickerSearchCache();
  });

  it('writes and reads memory cache', () => {
    writeTickerSearchCache('BB', [{ symbol: 'BBCA.JK' }]);

    expect(readTickerSearchCache('bb')?.results).toEqual([{ symbol: 'BBCA.JK' }]);
  });

  it('writes and reads localStorage cache', () => {
    writeTickerSearchCache('AAPL', [{ symbol: 'AAPL' }]);
    const raw = localStorage.getItem(
      `ta:ticker-search:${normalizeTickerSearchCacheKey('aapl', 10, {})}`
    );

    expect(JSON.parse(raw).results).toEqual([{ symbol: 'AAPL' }]);
  });

  it('returns null for expired cache', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T00:00:00Z'));
    writeTickerSearchCache('BTC', [{ symbol: 'BTC-USD' }]);
    vi.setSystemTime(new Date('2026-06-21T00:00:01Z'));

    expect(readTickerSearchCache('BTC')).toBeNull();
  });

  it('normalizes query key case-insensitively', () => {
    expect(normalizeTickerSearchCacheKey('BB', 10)).toBe(
      normalizeTickerSearchCacheKey('bb', 10)
    );
  });

  it('survives localStorage read/write error', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => writeTickerSearchCache('MSFT', [{ symbol: 'MSFT' }])).not.toThrow();
    expect(readTickerSearchCache('unknown')).toBeNull();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });

  it('clones cached result to avoid mutation', () => {
    writeTickerSearchCache('SPY', [{ symbol: 'SPY', name: 'SPDR' }]);
    const cached = readTickerSearchCache('spy');
    cached.results[0].name = 'mutated';

    expect(readTickerSearchCache('spy').results[0].name).toBe('SPDR');
  });
});
