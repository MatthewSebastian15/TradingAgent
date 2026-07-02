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
});
