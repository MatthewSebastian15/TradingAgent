import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useEconomicData } from './useEconomicData';
import { getEconomicData } from '../api/economic';

vi.mock('../api/economic', () => ({
  getEconomicData: vi.fn(),
}));

describe('useEconomicData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not fetch without source and command', () => {
    const { result } = renderHook(() => useEconomicData('', ''));

    expect(result.current).toEqual({ data: null, loading: false, error: null });
    expect(getEconomicData).not.toHaveBeenCalled();
  });

  it('starts loading, passes params, then exposes data', async () => {
    getEconomicData.mockResolvedValue({ rows: [1, 2] });

    const { result } = renderHook(() => useEconomicData('fred', 'cpi', { years: 5 }));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data).toEqual({ rows: [1, 2] });
    expect(getEconomicData).toHaveBeenCalledWith('fred', 'cpi', {
      params: { years: 5 },
      signal: expect.any(AbortSignal),
    });
  });

  it('exposes the error message on failure', async () => {
    getEconomicData.mockRejectedValue(new Error('fred down'));

    const { result } = renderHook(() => useEconomicData('fred', 'cpi'));

    await waitFor(() => expect(result.current.error).toBe('fred down'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBeNull();
  });

  it('refetches when params change by value, not identity', async () => {
    getEconomicData.mockResolvedValue({ rows: [] });

    const { rerender } = renderHook(({ params }) => useEconomicData('fred', 'cpi', params), {
      initialProps: { params: { years: 5 } },
    });
    await waitFor(() => expect(getEconomicData).toHaveBeenCalledTimes(1));

    rerender({ params: { years: 5 } }); // new object, same value → no refetch
    await waitFor(() => expect(getEconomicData).toHaveBeenCalledTimes(1));

    rerender({ params: { years: 10 } });
    await waitFor(() => expect(getEconomicData).toHaveBeenCalledTimes(2));
  });
});
