import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useStockOverview } from './useStockOverview';
import { getStockOverview } from '../api/market';

vi.mock('../api/market', () => ({
  getStockOverview: vi.fn(),
}));

describe('useStockOverview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle without a ticker', () => {
    const { result } = renderHook(() => useStockOverview(''));

    expect(result.current).toEqual({ data: null, loading: false, error: null });
    expect(getStockOverview).not.toHaveBeenCalled();
  });

  it('goes loading then exposes data', async () => {
    getStockOverview.mockResolvedValue({ ticker: 'AAPL', price: 190 });

    const { result } = renderHook(() => useStockOverview('AAPL'));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ ticker: 'AAPL', price: 190 });
    expect(result.current.error).toBeNull();
    expect(getStockOverview).toHaveBeenCalledWith('AAPL', { signal: expect.any(AbortSignal) });
  });

  it('exposes error message on failure', async () => {
    getStockOverview.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useStockOverview('AAPL'));

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('ignores AbortError after unmount', async () => {
    let reject;
    getStockOverview.mockReturnValue(new Promise((_, rej) => (reject = rej)));

    const { unmount } = renderHook(() => useStockOverview('AAPL'));
    unmount();
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    await act(async () => reject(abort));
    // no state update after unmount => no React warning/throw; nothing else to assert
  });
});
