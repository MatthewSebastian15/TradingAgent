import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRecentTickers, saveRecentTicker } from '@/utils/recentTickers';
import { clearTickerSearchCache, readTickerSearchCache } from '@/utils/tickerSearchCache';

import { useTickerSearch } from './useTickerSearch';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useTickerSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    clearRecentTickers();
    clearTickerSearchCache();
  });

  it('returns recent tickers when query empty', () => {
    saveRecentTicker({ symbol: 'BBCA.JK', name: 'Bank Central Asia' });

    const { result } = renderHook(() => useTickerSearch({ query: '' }));

    expect(result.current.recentResults[0].symbol).toBe('BBCA.JK');
  });

  it('returns local results immediately without waiting remote', () => {
    const searchTickers = vi.fn(() => Promise.resolve({ results: [] }));

    const { result } = renderHook(() => useTickerSearch({ query: 'B', searchTickers }));

    expect(result.current.results.length).toBeGreaterThan(0);
    expect(searchTickers).not.toHaveBeenCalled();
  });

  it('does not call remote for query length < 2', async () => {
    const searchTickers = vi.fn(() => Promise.resolve({ results: [] }));
    renderHook(() => useTickerSearch({ query: 'B', searchTickers }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });

    expect(searchTickers).not.toHaveBeenCalled();
  });

  it('calls remote after 150ms debounce for query length >= 2', async () => {
    const searchTickers = vi.fn(() => Promise.resolve({ results: [{ symbol: 'BBCA.JK' }] }));
    renderHook(() => useTickerSearch({ query: 'BB', searchTickers }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(149);
    });
    expect(searchTickers).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(searchTickers).toHaveBeenCalledTimes(1);
  });

  it('aborts stale request when query changes', async () => {
    const signals = [];
    const searchTickers = vi.fn(({ signal }) => {
      signals.push(signal);
      return new Promise(() => {});
    });
    const { rerender } = renderHook(({ query }) => useTickerSearch({ query, searchTickers }), {
      initialProps: { query: 'AA' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    rerender({ query: 'AAPL' });

    expect(signals[0].aborted).toBe(true);
  });

  it('ignores stale response that resolves late', async () => {
    const first = deferred();
    const second = deferred();
    const searchTickers = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result, rerender } = renderHook(({ query }) => useTickerSearch({ query, searchTickers }), {
      initialProps: { query: 'AA' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });
    rerender({ query: 'AAPL' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      second.resolve({ results: [{ symbol: 'AAPL', name: 'Apple Inc' }] });
      await Promise.resolve();
    });
    expect(result.current.results[0].symbol).toBe('AAPL');

    await act(async () => {
      first.resolve({ results: [{ symbol: 'AA', name: 'Old' }] });
      await Promise.resolve();
    });

    expect(result.current.results[0].symbol).toBe('AAPL');
  });

  it('writes remote results to shared cache', async () => {
    const searchTickers = vi.fn(() => Promise.resolve({ results: [{ symbol: 'AAPL' }] }));
    renderHook(() => useTickerSearch({ query: 'AAPL', searchTickers }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
    });
    expect(readTickerSearchCache('AAPL')?.results[0].symbol).toBe('AAPL');
  });

  it('merges local + cached + remote results', async () => {
    const searchTickers = vi.fn(() => Promise.resolve({ results: [{ symbol: 'REMOTE' }] }));
    const { result } = renderHook(() => useTickerSearch({ query: 'BB', searchTickers }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
    });

    expect(result.current.results.map((item) => item.symbol)).toContain('BBCA.JK');
  });

  it('saves recent ticker on selectTicker', () => {
    const { result } = renderHook(() => useTickerSearch({ query: 'AAPL' }));

    act(() => {
      result.current.selectTicker({ symbol: 'AAPL', name: 'Apple Inc' });
    });

    const { result: emptyResult } = renderHook(() => useTickerSearch({ query: '' }));
    expect(emptyResult.current.recentResults[0].symbol).toBe('AAPL');
  });

  it('keeps local results visible when remote fails', async () => {
    const searchTickers = vi.fn(() => Promise.reject(new Error('network')));
    const { result } = renderHook(() => useTickerSearch({ query: 'BB', searchTickers }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
    });

    expect(result.current.results.map((item) => item.symbol)).toContain('BBCA.JK');
  });
});
