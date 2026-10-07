import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useStockOverview } from './useStockOverview';
import { getStockOverview } from '../api/market';

vi.mock('../api/market', () => ({
  getStockOverview: vi.fn(),
}));

describe('useStockOverview', () => {
  beforeEach(() => {
    getStockOverview.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('stays idle without a ticker', () => {
    const { result } = renderHook(() => useStockOverview(''));

    expect(result.current).toEqual({
      data: null,
      loading: false,
      error: null,
      retry: expect.any(Function),
    });
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

  // Records every render's return value, so the render between a ticker change and the
  // reset effect is observable (rerender() only exposes the post-effect value).
  function renderRecorded(initial) {
    const renders = [];
    const utils = renderHook(
      ({ t }) => {
        const value = useStockOverview(t);
        renders.push(value);
        return value;
      },
      { initialProps: { t: initial } }
    );
    return { renders, ...utils };
  }

  it('shows nothing from the previous ticker in any render after a ticker change', async () => {
    getStockOverview.mockResolvedValueOnce({ ticker: 'AAPL' });
    getStockOverview.mockReturnValueOnce(new Promise(() => {}));

    const { result, renders, rerender } = renderRecorded('AAPL');
    await waitFor(() => expect(result.current.data).toEqual({ ticker: 'AAPL' }));

    const before = renders.length;
    rerender({ t: 'MSFT' });
    await act(async () => {});

    const after = renders.slice(before);
    expect(after.length).toBeGreaterThan(0);
    for (const snap of after) expect(snap.data).toBeNull();
    expect(result.current.loading).toBe(true);
  });

  it('does not leak the previous ticker error or loading in any render after a change', async () => {
    getStockOverview.mockRejectedValueOnce(new Error('boom'));
    getStockOverview.mockResolvedValueOnce({ ticker: 'MSFT' });

    const { result, renders, rerender } = renderRecorded('AAPL');
    await waitFor(() => expect(result.current.error).toBe('boom'));

    const before = renders.length;
    rerender({ t: 'MSFT' });
    expect(renders[before].error).toBeNull();
    expect(renders[before].loading).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual({ ticker: 'MSFT' }));
    expect(result.current.error).toBeNull();
  });

  it('ignores a stale non-abortable response for the previous ticker', async () => {
    let resolveA;
    getStockOverview.mockReturnValueOnce(new Promise((res) => (resolveA = res)));
    getStockOverview.mockResolvedValueOnce({ ticker: 'MSFT' });

    const { result, rerender } = renderHook(({ t }) => useStockOverview(t), {
      initialProps: { t: 'AAPL' },
    });
    rerender({ t: 'MSFT' });
    await waitFor(() => expect(result.current.data).toEqual({ ticker: 'MSFT' }));

    await act(async () => resolveA({ ticker: 'AAPL' }));
    expect(result.current.data).toEqual({ ticker: 'MSFT' });
    expect(result.current.loading).toBe(false);
  });

  it('returns to idle when the ticker is cleared', async () => {
    getStockOverview.mockResolvedValueOnce({ ticker: 'AAPL' });

    const { result, rerender } = renderHook(({ t }) => useStockOverview(t), {
      initialProps: { t: 'AAPL' },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());

    rerender({ t: '' });
    expect(result.current).toEqual({
      data: null,
      loading: false,
      error: null,
      retry: expect.any(Function),
    });
  });

  it('retry() refetches the same ticker with forceRefresh and recovers from an error', async () => {
    getStockOverview.mockRejectedValueOnce(new Error('boom'));
    getStockOverview.mockResolvedValueOnce({ ticker: 'AAPL', price: 190 });

    const { result } = renderHook(() => useStockOverview('AAPL'));
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => result.current.retry());

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
    await waitFor(() => expect(result.current.data).toEqual({ ticker: 'AAPL', price: 190 }));
    expect(getStockOverview).toHaveBeenCalledTimes(2);
    expect(getStockOverview).toHaveBeenLastCalledWith('AAPL', {
      signal: expect.any(AbortSignal),
      forceRefresh: true,
    });
  });

  it('a ticker change after retry goes back to normal (non-forced) fetches', async () => {
    getStockOverview.mockResolvedValue({ ticker: 'X' });

    const { result, rerender } = renderHook(({ t }) => useStockOverview(t), {
      initialProps: { t: 'AAPL' },
    });
    await waitFor(() => expect(result.current.data).not.toBeNull());
    act(() => result.current.retry());
    await waitFor(() => expect(getStockOverview).toHaveBeenCalledTimes(2));

    rerender({ t: 'MSFT' });
    await waitFor(() => expect(getStockOverview).toHaveBeenCalledTimes(3));
    expect(getStockOverview).toHaveBeenLastCalledWith('MSFT', { signal: expect.any(AbortSignal) });
  });
});
