import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearMarketMoversClientCacheForTests, useMarketMovers } from './useMarketMovers';
import { getMarketMovers } from '../api/market';

vi.mock('../api/market', () => ({
  getMarketMovers: vi.fn(),
}));

const PAYLOAD = { gainers: [{ sym: 'NVDA' }], losers: [{ sym: 'INTC' }] };

describe('useMarketMovers', () => {
  beforeEach(() => {
    clearMarketMoversClientCacheForTests();
  });

  afterEach(() => {
    clearMarketMoversClientCacheForTests();
    vi.restoreAllMocks();
  });

  it('loads default US/NASDAQ movers', async () => {
    getMarketMovers.mockResolvedValue(PAYLOAD);

    const { result, unmount } = renderHook(() => useMarketMovers());

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual(PAYLOAD);
    expect(getMarketMovers).toHaveBeenCalledWith(
      expect.objectContaining({ country: 'United States', exchange: 'NASDAQ' }),
      expect.anything()
    );
    unmount();
  });

  it('refresh with new filters refetches; blank filters are rejected', async () => {
    getMarketMovers.mockResolvedValue(PAYLOAD);

    const { result, unmount } = renderHook(() => useMarketMovers());
    await waitFor(() => expect(result.current.loading).toBe(false));

    let ok;
    act(() => {
      ok = result.current.refresh({ country: 'Indonesia', exchange: 'IDX' });
    });
    expect(ok).toBe(true);
    await waitFor(() =>
      expect(getMarketMovers).toHaveBeenCalledWith(
        expect.objectContaining({ country: 'Indonesia', exchange: 'IDX' }),
        expect.anything()
      )
    );

    act(() => {
      ok = result.current.refresh({ country: '  ', exchange: 'IDX' });
    });
    expect(ok).toBe(false);
    expect(result.current.error).toBe('Country and exchange required.');
    unmount();
  });

  it('sets a friendly error when the fetch fails', async () => {
    getMarketMovers.mockRejectedValue(new Error('vendor down'));

    const { result, unmount } = renderHook(() => useMarketMovers());

    await waitFor(() =>
      expect(result.current.error).toBe('Failed to load market data from yfinance.')
    );
    expect(result.current.loading).toBe(false);
    unmount();
  });
});
