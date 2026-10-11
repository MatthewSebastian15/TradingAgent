import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useWatchlistQuotes } from './useWatchlistQuotes';
import { getMarketQuotes, getMarketSparklines } from '../api/market';

vi.mock('../api/market', () => ({
  getMarketQuotes: vi.fn(),
  getMarketSparklines: vi.fn(),
}));

// Module-level quote/trend caches persist across tests — use distinct symbols per test.
// Symbol arrays must be identity-stable across re-renders (the hook memoizes on the
// array reference), so never pass a fresh literal inside the render callback.
function mountQuotes(symbols) {
  return renderHook((props) => useWatchlistQuotes(props.symbols), {
    initialProps: { symbols },
  });
}

function mountQuotesWithOptions(symbols, options) {
  return renderHook((props) => useWatchlistQuotes(props.symbols, options), {
    initialProps: { symbols },
  });
}

describe('useWatchlistQuotes', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns empty maps for an empty symbol list without fetching', async () => {
    const { result, unmount } = mountQuotes([]);

    await waitFor(() => expect(result.current.loadingQuotes).toBe(false));
    expect(result.current.quotesBySymbol.size).toBe(0);
    expect(result.current.trendsBySymbol.size).toBe(0);
    expect(getMarketQuotes).not.toHaveBeenCalled();
    unmount();
  });

  it('loads quotes and trends keyed by normalized symbol', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'aapl', price: 190 }] });
    getMarketSparklines.mockResolvedValue({ sparklines: { AAPL: [1, 2, 'x', 3] } });

    const { result, unmount } = mountQuotes(['aapl', 'AAPL']);

    await waitFor(() => {
      expect(result.current.quotesBySymbol.get('AAPL')).toMatchObject({ price: 190 });
      expect(result.current.trendsBySymbol.get('AAPL')).toEqual([1, 2, 3]);
    });
    expect(getMarketQuotes).toHaveBeenCalledWith(['AAPL'], { signal: expect.any(AbortSignal) });
    expect(result.current.error).toBe('');
    unmount();
  });

  it('surfaces quote fetch errors but keeps cached data path alive', async () => {
    getMarketQuotes.mockRejectedValue(new Error('quotes down'));
    getMarketSparklines.mockResolvedValue({ sparklines: {} });

    const { result, unmount } = mountQuotes(['MSFT']);

    await waitFor(() => expect(result.current.error).toBe('quotes down'));
    expect(result.current.loadingQuotes).toBe(false);
    unmount();
  });

  it('skips sparkline requests entirely when trends are disabled', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NOTREND', price: 5 }] });
    getMarketSparklines.mockResolvedValue({ sparklines: { NOTREND: [1, 2, 3] } });

    const { result, unmount } = mountQuotesWithOptions(['NOTREND'], { trends: false });

    await waitFor(() =>
      expect(result.current.quotesBySymbol.get('NOTREND')).toMatchObject({ price: 5 })
    );
    const sparklineCallsForSymbol = getMarketSparklines.mock.calls.filter(([batch]) =>
      batch.includes('NOTREND')
    );
    expect(sparklineCallsForSymbol).toHaveLength(0);
    expect(result.current.loadingTrends).toBe(false);
    expect(result.current.trendsBySymbol.size).toBe(0);
    unmount();
  });

  it('splits a 45-symbol group into 20/20/5 batches and renders every row', async () => {
    getMarketQuotes.mockClear();
    getMarketSparklines.mockClear();
    const symbols = Array.from({ length: 45 }, (_, index) => `BATCHQ${index}`);
    getMarketQuotes.mockImplementation(async (batch) => ({
      quotes: batch.map((sym) => ({
        sym,
        price: 1,
        chg: '+0.10%',
        pos: true,
        volume: 10,
        error: false,
      })),
    }));
    getMarketSparklines.mockImplementation(async (batch) => ({
      sparklines: Object.fromEntries(batch.map((sym) => [sym, [1, 2, 3]])),
    }));

    const { result, unmount } = mountQuotes(symbols);

    await waitFor(() => expect(result.current.quotesBySymbol.size).toBe(45));
    await waitFor(() => expect(result.current.trendsBySymbol.size).toBe(45));
    const sizes = (mock) => mock.mock.calls.map(([batch]) => batch.length).sort((a, b) => b - a);
    expect(sizes(getMarketQuotes)).toEqual([20, 20, 5]);
    expect(sizes(getMarketSparklines)).toEqual([20, 20, 5]);
    expect(result.current.error).toBe('');
    unmount();
  });

  it('keeps quotes from healthy batches when one batch fails', async () => {
    getMarketQuotes.mockReset();
    getMarketSparklines.mockReset();
    const symbols = Array.from({ length: 25 }, (_, index) => `ISOL${index}`);
    getMarketQuotes.mockImplementation(async (batch) => {
      if (batch.includes('ISOL0')) throw new Error('vendor down');
      return {
        quotes: batch.map((sym) => ({ sym, price: 2, chg: '+1.00%', pos: true, error: false })),
      };
    });
    getMarketSparklines.mockResolvedValue({ sparklines: {} });

    const { result, unmount } = mountQuotes(symbols);

    await waitFor(() => expect(result.current.quotesBySymbol.size).toBe(5));
    await waitFor(() => expect(result.current.failedSymbols.size).toBe(20));
    expect(result.current.error).toBe('Quotes unavailable for 20 of 25 symbols.');
    expect(result.current.quotesBySymbol.has('ISOL24')).toBe(true);
    unmount();
  });

  it('still batches quotes but skips sparklines when trends are disabled', async () => {
    getMarketQuotes.mockReset();
    getMarketSparklines.mockReset();
    const symbols = Array.from({ length: 25 }, (_, index) => `NOTRB${index}`);
    getMarketQuotes.mockImplementation(async (batch) => ({
      quotes: batch.map((sym) => ({ sym, price: 3, chg: '+0.10%', pos: true, error: false })),
    }));

    const { result, unmount } = mountQuotesWithOptions(symbols, { trends: false });

    await waitFor(() => expect(result.current.quotesBySymbol.size).toBe(25));
    expect(getMarketQuotes).toHaveBeenCalledTimes(2);
    expect(getMarketSparklines).not.toHaveBeenCalled();
    expect(result.current.trendsBySymbol.size).toBe(0);
    unmount();
  });
});
