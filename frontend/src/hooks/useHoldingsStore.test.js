import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoldingsStore } from './useHoldingsStore';
import { addHolding, readHoldingsDetailed, removeHolding } from '../services/holdingsStore';

vi.mock('../services/holdingsStore', () => ({
  addHolding: vi.fn(),
  readHoldingsDetailed: vi.fn(),
  removeHolding: vi.fn(),
  clearHoldings: vi.fn(),
  HOLDINGS_STORAGE_KEY: 'portfolio_holdings_v1',
}));

const ok = (items) => ({ items, status: 'ok' });

describe('useHoldingsStore', () => {
  beforeEach(() => {
    readHoldingsDetailed.mockResolvedValue(ok([]));
    addHolding.mockResolvedValue({ ok: true });
    removeHolding.mockResolvedValue({ ok: true });
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
});
