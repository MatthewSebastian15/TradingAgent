import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useHoldingsStore } from './useHoldingsStore';
import { addHolding, readHoldings, removeHolding } from '../services/holdingsStore';

vi.mock('../services/holdingsStore', () => ({
  addHolding: vi.fn(),
  readHoldings: vi.fn(),
  removeHolding: vi.fn(),
}));

describe('useHoldingsStore', () => {
  beforeEach(() => {
    readHoldings.mockResolvedValue([]);
    addHolding.mockResolvedValue();
    removeHolding.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates holdings', async () => {
    readHoldings.mockResolvedValue([{ id: 'h1', ticker: 'BBCA.JK' }]);

    const { result } = renderHook(() => useHoldingsStore());

    expect(result.current.hydrated).toBe(false);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.holdings).toEqual([{ id: 'h1', ticker: 'BBCA.JK' }]);
  });

  it('add persists then refreshes', async () => {
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    readHoldings.mockResolvedValue([{ id: 'h2', ticker: 'TLKM.JK' }]);
    await act(() => result.current.add({ id: 'h2', ticker: 'TLKM.JK' }));

    expect(addHolding).toHaveBeenCalledWith({ id: 'h2', ticker: 'TLKM.JK' });
    expect(result.current.holdings).toEqual([{ id: 'h2', ticker: 'TLKM.JK' }]);
  });

  it('remove deletes by id then refreshes', async () => {
    readHoldings.mockResolvedValue([{ id: 'h2', ticker: 'TLKM.JK' }]);
    const { result } = renderHook(() => useHoldingsStore());
    await waitFor(() => expect(result.current.holdings).toHaveLength(1));

    readHoldings.mockResolvedValue([]);
    await act(() => result.current.remove('h2'));

    expect(removeHolding).toHaveBeenCalledWith('h2');
    expect(result.current.holdings).toEqual([]);
  });
});
