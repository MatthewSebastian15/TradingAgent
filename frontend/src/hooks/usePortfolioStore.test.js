import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePortfolioStore } from './usePortfolioStore';
import {
  addTracked,
  closeTracked,
  readTrackedDetailed,
  removeTracked,
  reopenTracked,
} from '../services/portfolioStore';

vi.mock('../services/portfolioStore', () => ({
  addTracked: vi.fn(),
  readTrackedDetailed: vi.fn(),
  removeTracked: vi.fn(),
  clearTracked: vi.fn(),
  closeTracked: vi.fn(),
  reopenTracked: vi.fn(),
  TRACKED_STORAGE_KEY: 'portfolio_tracked_v1',
}));

const ok = (items) => ({ items, status: 'ok' });

describe('usePortfolioStore', () => {
  beforeEach(() => {
    readTrackedDetailed.mockResolvedValue(ok([]));
    addTracked.mockResolvedValue({ ok: true });
    removeTracked.mockResolvedValue({ ok: true });
    closeTracked.mockResolvedValue({ ok: true });
    reopenTracked.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates from the store on mount', async () => {
    readTrackedDetailed.mockResolvedValue(ok([{ id: 'a1', ticker: 'AAPL' }]));

    const { result } = renderHook(() => usePortfolioStore());

    expect(result.current.hydrated).toBe(false);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.tracked).toEqual([{ id: 'a1', ticker: 'AAPL' }]);
    expect(result.current.trackedIds.has('a1')).toBe(true);
  });

  it('track persists then refreshes the list', async () => {
    const { result } = renderHook(() => usePortfolioStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    readTrackedDetailed.mockResolvedValue(ok([{ id: 'b2', ticker: 'MSFT' }]));
    await act(() => result.current.track({ id: 'b2', ticker: 'MSFT' }));

    expect(addTracked).toHaveBeenCalledWith({ id: 'b2', ticker: 'MSFT' });
    expect(result.current.tracked).toEqual([{ id: 'b2', ticker: 'MSFT' }]);
  });

  it('untrack removes by id then refreshes', async () => {
    readTrackedDetailed.mockResolvedValue(ok([{ id: 'b2', ticker: 'MSFT' }]));
    const { result } = renderHook(() => usePortfolioStore());
    await waitFor(() => expect(result.current.tracked).toHaveLength(1));

    readTrackedDetailed.mockResolvedValue(ok([]));
    await act(() => result.current.untrack('b2'));

    expect(removeTracked).toHaveBeenCalledWith('b2');
    expect(result.current.tracked).toEqual([]);
    expect(result.current.trackedIds.size).toBe(0);
  });

  it('exposes unreadable storage and lets the user start fresh', async () => {
    readTrackedDetailed.mockResolvedValue({ items: [], status: 'unreadable' });
    const { result } = renderHook(() => usePortfolioStore());

    await waitFor(() => expect(result.current.storageStatus).toBe('unreadable'));

    readTrackedDetailed.mockResolvedValue({ items: [], status: 'empty' });
    await act(() => result.current.resetUnreadable());
    expect(result.current.storageStatus).toBe('ok');
  });

  it('close and reopen call the store then refresh', async () => {
    const { result } = renderHook(() => usePortfolioStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(() => result.current.close('a1', 123));
    expect(closeTracked).toHaveBeenCalledWith('a1', 123);

    await act(() => result.current.reopen('a1'));
    expect(reopenTracked).toHaveBeenCalledWith('a1');
  });
});
