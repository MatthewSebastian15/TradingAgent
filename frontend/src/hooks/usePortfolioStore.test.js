import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { usePortfolioStore } from './usePortfolioStore';
import { addTracked, readTracked, removeTracked } from '../services/portfolioStore';

vi.mock('../services/portfolioStore', () => ({
  addTracked: vi.fn(),
  readTracked: vi.fn(),
  removeTracked: vi.fn(),
}));

describe('usePortfolioStore', () => {
  beforeEach(() => {
    readTracked.mockResolvedValue([]);
    addTracked.mockResolvedValue();
    removeTracked.mockResolvedValue();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('hydrates from the store on mount', async () => {
    readTracked.mockResolvedValue([{ id: 'a1', ticker: 'AAPL' }]);

    const { result } = renderHook(() => usePortfolioStore());

    expect(result.current.hydrated).toBe(false);
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.tracked).toEqual([{ id: 'a1', ticker: 'AAPL' }]);
    expect(result.current.trackedIds.has('a1')).toBe(true);
  });

  it('track persists then refreshes the list', async () => {
    const { result } = renderHook(() => usePortfolioStore());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    readTracked.mockResolvedValue([{ id: 'b2', ticker: 'MSFT' }]);
    await act(() => result.current.track({ id: 'b2', ticker: 'MSFT' }));

    expect(addTracked).toHaveBeenCalledWith({ id: 'b2', ticker: 'MSFT' });
    expect(result.current.tracked).toEqual([{ id: 'b2', ticker: 'MSFT' }]);
  });

  it('untrack removes by id then refreshes', async () => {
    readTracked.mockResolvedValue([{ id: 'b2', ticker: 'MSFT' }]);
    const { result } = renderHook(() => usePortfolioStore());
    await waitFor(() => expect(result.current.tracked).toHaveLength(1));

    readTracked.mockResolvedValue([]);
    await act(() => result.current.untrack('b2'));

    expect(removeTracked).toHaveBeenCalledWith('b2');
    expect(result.current.tracked).toEqual([]);
    expect(result.current.trackedIds.size).toBe(0);
  });
});
