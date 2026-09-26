import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { usePeerOverviews } from './usePeerOverviews';
import { getStockOverview } from '../../../../api/market';

vi.mock('../../../../api/market', () => ({
  getStockOverview: vi.fn(async (sym) => {
    if (sym === 'BAD') throw new Error('nope');
    return { ticker: sym, pe_ttm: 10 };
  }),
}));

describe('usePeerOverviews', () => {
  it('returns fulfilled overviews only', async () => {
    const { result } = renderHook(() => usePeerOverviews(['MSFT', 'BAD']));
    await waitFor(() => expect(result.current).toHaveLength(1));
    expect(result.current[0].ticker).toBe('MSFT');
    expect(getStockOverview).toHaveBeenCalledTimes(2);
  });

  it('is empty for no symbols', () => {
    const { result } = renderHook(() => usePeerOverviews([]));
    expect(result.current).toEqual([]);
  });
});
