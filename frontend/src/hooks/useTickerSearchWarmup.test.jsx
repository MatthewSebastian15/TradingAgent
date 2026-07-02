import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getMarketSearchWarmup: vi.fn(),
  readRecentTickers: vi.fn(),
  writeTickerSearchCache: vi.fn(),
}));

vi.mock('@/api/market', () => ({ getMarketSearchWarmup: mocks.getMarketSearchWarmup }));
vi.mock('@/utils/recentTickers', () => ({ readRecentTickers: mocks.readRecentTickers }));
vi.mock('@/utils/tickerSearchCache', () => ({
  writeTickerSearchCache: mocks.writeTickerSearchCache,
}));

// Module-level once-guard → fresh module per test.
async function loadHook() {
  vi.resetModules();
  return (await import('./useTickerSearchWarmup')).useTickerSearchWarmup;
}

describe('useTickerSearchWarmup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warms up once and seeds the empty-query cache', async () => {
    mocks.getMarketSearchWarmup.mockResolvedValue({
      popular: [{ symbol: 'AAPL' }],
      meta: { source: 'backend' },
    });
    const useTickerSearchWarmup = await loadHook();

    const first = renderHook(() => useTickerSearchWarmup());
    await act(async () => {});
    const second = renderHook(() => useTickerSearchWarmup());
    await act(async () => {});

    expect(mocks.getMarketSearchWarmup).toHaveBeenCalledTimes(1);
    expect(mocks.readRecentTickers).toHaveBeenCalledWith({ limit: 10 });
    expect(mocks.writeTickerSearchCache).toHaveBeenCalledWith('', [{ symbol: 'AAPL' }], {
      limit: 10,
      filters: { market: 'ALL', type: 'ALL' },
      meta: { source: 'backend' },
    });
    first.unmount();
    second.unmount();
  });

  it('does nothing when disabled', async () => {
    const useTickerSearchWarmup = await loadHook();

    renderHook(() => useTickerSearchWarmup({ enabled: false }));
    await act(async () => {});

    expect(mocks.getMarketSearchWarmup).not.toHaveBeenCalled();
  });

  it('resets the guard on failure so the next mount retries', async () => {
    mocks.getMarketSearchWarmup.mockRejectedValueOnce(new Error('warmup failed'));
    mocks.getMarketSearchWarmup.mockResolvedValueOnce({ popular: [] });
    const useTickerSearchWarmup = await loadHook();

    const failed = renderHook(() => useTickerSearchWarmup());
    await act(async () => {});
    failed.unmount();

    const retried = renderHook(() => useTickerSearchWarmup());
    await act(async () => {});
    retried.unmount();

    expect(mocks.getMarketSearchWarmup).toHaveBeenCalledTimes(2);
    expect(mocks.writeTickerSearchCache).toHaveBeenCalledTimes(1);
  });
});
