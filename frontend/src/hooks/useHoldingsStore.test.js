import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoldingsStore } from './useHoldingsStore';
import {
  addHolding,
  readHoldingsDetailed,
  removeHolding,
  updateHolding,
} from '../services/holdingsStore';

vi.mock('../services/holdingsStore', () => ({
  addHolding: vi.fn(),
  readHoldingsDetailed: vi.fn(),
  removeHolding: vi.fn(),
  clearHoldings: vi.fn(),
  updateHolding: vi.fn(),
  HOLDINGS_STORAGE_KEY: 'portfolio_holdings_v1',
}));

const ok = (items) => ({ items, status: 'ok' });

describe('useHoldingsStore', () => {
  beforeEach(() => {
    readHoldingsDetailed.mockResolvedValue(ok([]));
    addHolding.mockResolvedValue({ ok: true });
    removeHolding.mockResolvedValue({ ok: true });
    updateHolding.mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates holdings', async () => {
    readHoldingsDetailed.mockResolvedValue(ok([{ id: 'h1', ticker: 'BBCA.JK' }]));

    const { result } = renderHook(() => useHoldingsStore());

    expect(result.current.hydrated).toBe(false);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.holdings).toEqual([{ id: 'h1', ticker: 'BBCA.JK' }]);
  });

  it('add persists then refreshes', async () => {
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    readHoldingsDetailed.mockResolvedValue(ok([{ id: 'h2', ticker: 'TLKM.JK' }]));
    await act(() => result.current.add({ id: 'h2', ticker: 'TLKM.JK' }));

    expect(addHolding).toHaveBeenCalledWith({ id: 'h2', ticker: 'TLKM.JK' });
    expect(result.current.holdings).toEqual([{ id: 'h2', ticker: 'TLKM.JK' }]);
  });

  it('remove deletes by id then refreshes', async () => {
    readHoldingsDetailed.mockResolvedValue(ok([{ id: 'h2', ticker: 'TLKM.JK' }]));
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.holdings).toHaveLength(1));

    readHoldingsDetailed.mockResolvedValue(ok([]));
    await act(() => result.current.remove('h2'));

    expect(removeHolding).toHaveBeenCalledWith('h2');
    expect(result.current.holdings).toEqual([]);
  });

  it('exposes unreadable storage and lets the user start fresh', async () => {
    readHoldingsDetailed.mockResolvedValue({ items: [], status: 'unreadable' });
    const { result } = renderHook(() => useHoldingsStore());

    await waitFor(() => expect(result.current.storageStatus).toBe('unreadable'));

    readHoldingsDetailed.mockResolvedValue({ items: [], status: 'empty' });
    await act(() => result.current.resetUnreadable());
    expect(result.current.storageStatus).toBe('ok');
  });

  it('ignores a second add while the first is in flight (double click)', async () => {
    addHolding.mockClear(); // call history survives restoreAllMocks in Vitest 4
    let release;
    addHolding.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true });
        })
    );
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let first;
    let second;
    await act(async () => {
      first = result.current.add({ ticker: 'AAPL', shares: 1, cost_basis: 1 });
      second = result.current.add({ ticker: 'AAPL', shares: 1, cost_basis: 1 });
      await Promise.resolve();
    });

    expect(result.current.pending).toBe(true);
    expect(await second).toEqual({ ok: false, reason: 'busy' });
    await act(async () => {
      release();
      await first;
    });
    expect(addHolding).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
  });

  it('update edits by id then refreshes', async () => {
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    await act(() => result.current.update('h1', { shares: 9 }));

    expect(updateHolding).toHaveBeenCalledWith('h1', { shares: 9 });
  });
});
