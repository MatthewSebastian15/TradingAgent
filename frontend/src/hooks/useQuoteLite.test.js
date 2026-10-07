import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useQuoteLite } from './useQuoteLite';
import { getQuoteLite } from '../api/market';

vi.mock('../api/market', () => ({ getQuoteLite: vi.fn() }));

const quote = (price, extra = {}) => ({ sym: 'AAPL', price, volume: 10, error: false, ...extra });

describe('useQuoteLite', () => {
  beforeEach(() => {
    getQuoteLite.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays idle without a ticker', () => {
    const { result } = renderHook(() => useQuoteLite(''));

    expect(result.current).toEqual({ quote: null, updatedAt: null });
    expect(getQuoteLite).not.toHaveBeenCalled();
  });

  it('fetches immediately, then polls on an interval and advances updatedAt', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    getQuoteLite.mockResolvedValueOnce(quote(100)).mockResolvedValueOnce(quote(101));

    const { result } = renderHook(() => useQuoteLite('AAPL'));
    await vi.waitFor(() => expect(result.current.quote?.price).toBe(100));
    const firstAt = result.current.updatedAt;

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });

    await vi.waitFor(() => expect(result.current.quote?.price).toBe(101));
    expect(result.current.updatedAt).toBeGreaterThan(firstAt);
    expect(getQuoteLite).toHaveBeenCalledTimes(2);
  });

  it('keeps the last good quote when a poll fails or returns an error payload', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    getQuoteLite
      .mockResolvedValueOnce(quote(100))
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(quote(null, { error: true }));

    const { result } = renderHook(() => useQuoteLite('AAPL'));
    await vi.waitFor(() => expect(result.current.quote?.price).toBe(100));
    const at = result.current.updatedAt;

    for (let i = 0; i < 2; i += 1) {
      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });
    }

    expect(getQuoteLite).toHaveBeenCalledTimes(3);
    expect(result.current.quote?.price).toBe(100);
    expect(result.current.updatedAt).toBe(at);
  });

  it('never exposes the previous ticker quote after a ticker change', async () => {
    getQuoteLite.mockResolvedValueOnce(quote(100));
    getQuoteLite.mockReturnValueOnce(new Promise(() => {}));

    const { result, rerender } = renderHook(({ t }) => useQuoteLite(t), {
      initialProps: { t: 'AAPL' },
    });
    await waitFor(() => expect(result.current.quote?.price).toBe(100));

    rerender({ t: 'MSFT' });

    expect(result.current).toEqual({ quote: null, updatedAt: null });
  });

  it('ignores a late response for a ticker that is no longer active', async () => {
    let resolveOld;
    getQuoteLite.mockReturnValueOnce(new Promise((res) => (resolveOld = res)));
    getQuoteLite.mockResolvedValueOnce(quote(200, { sym: 'MSFT' }));

    const { result, rerender } = renderHook(({ t }) => useQuoteLite(t), {
      initialProps: { t: 'AAPL' },
    });
    rerender({ t: 'MSFT' });
    await waitFor(() => expect(result.current.quote?.price).toBe(200));

    await act(async () => resolveOld(quote(1)));

    expect(result.current.quote?.price).toBe(200);
  });

  it('stops polling on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    getQuoteLite.mockResolvedValue(quote(100));

    const { unmount } = renderHook(() => useQuoteLite('AAPL'));
    await vi.waitFor(() => expect(getQuoteLite).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });

    expect(getQuoteLite).toHaveBeenCalledTimes(1);
  });
});
