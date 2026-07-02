import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_TICKERS,
  EMPTY_CHANGE,
  fallbackTickerQuotes,
  useTickerQuotes,
  withTickerLabels,
} from './useTickerQuotes';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: vi.fn().mockResolvedValue({}),
}));

describe('withTickerLabels / fallbackTickerQuotes', () => {
  it('merges quotes into the tape order and keeps labels', () => {
    const merged = withTickerLabels([{ sym: 'BTC-USD', chg: '+2.1%', pos: true, price: 60000 }]);

    expect(merged).toHaveLength(DEFAULT_TICKERS.length);
    const btc = merged.find((item) => item.ticker === 'BTC-USD');
    expect(btc).toMatchObject({ label: 'BTC', chg: '+2.1%', price: 60000 });
  });

  it('fallback rows carry the empty-change placeholder', () => {
    expect(fallbackTickerQuotes().every((item) => item.chg === EMPTY_CHANGE)).toBe(true);
  });
});

describe('useTickerQuotes', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('starts with fallback quotes then swaps in fetched quotes', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ quotes: [{ sym: '^VIX', chg: '-1.0%', pos: false, price: 13.5 }] }),
    });

    const { result, unmount } = renderHook(() => useTickerQuotes());

    expect(result.current.quotes.every((item) => item.chg === EMPTY_CHANGE)).toBe(true);
    await waitFor(() => {
      expect(result.current.quotes.find((item) => item.ticker === '^VIX').chg).toBe('-1.0%');
    });
    expect(result.current.fetchError).toBe(false);
    unmount();
  });

  it('keeps fallback and flags fetchError on HTTP failure', async () => {
    fetch.mockResolvedValue({ ok: false, status: 502 });

    const { result, unmount } = renderHook(() => useTickerQuotes());

    await waitFor(() => expect(result.current.fetchError).toBe(true));
    expect(result.current.quotes.every((item) => item.chg === EMPTY_CHANGE)).toBe(true);
    unmount();
  });

  it('hydrates initial quotes from the localStorage cache', async () => {
    const cacheKey = Object.keys(window.localStorage);
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ quotes: [{ sym: 'GC=F', chg: '+0.5%', pos: true, price: 2400 }] }),
    });

    const first = renderHook(() => useTickerQuotes());
    await waitFor(() => {
      expect(first.result.current.quotes.find((item) => item.ticker === 'GC=F').chg).toBe('+0.5%');
    });
    first.unmount();
    expect(Object.keys(window.localStorage).length).toBeGreaterThan(cacheKey.length);

    const second = renderHook(() => useTickerQuotes());
    expect(second.result.current.quotes.find((item) => item.ticker === 'GC=F').chg).toBe('+0.5%');
    second.unmount();
  });
});
