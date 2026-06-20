import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearMarketOverviewClientCacheForTests,
  seedMarketOverviewClientCacheForTests,
  useMarketOverviewData,
} from './useMarketOverviewData';
import { getMarketOverview } from '../api/market';

vi.mock('../api/market', () => ({
  getMarketOverview: vi.fn(),
}));

const DEFAULT_SYMBOLS = ['SPY'];

function Harness({ symbols = DEFAULT_SYMBOLS }) {
  const { data, status, loading, refresh } = useMarketOverviewData(symbols);
  const items = data?.items || [];

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="symbols">{items.map((item) => item.symbol).join(',')}</span>
      <button type="button" onClick={refresh}>
        refresh
      </button>
    </div>
  );
}

describe('useMarketOverviewData', () => {
  beforeEach(() => {
    clearMarketOverviewClientCacheForTests();
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
  });

  afterEach(() => {
    cleanup();
    clearMarketOverviewClientCacheForTests();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('loads market data on initial render without requiring refresh click', async () => {
    getMarketOverview.mockResolvedValue({ items: [{ symbol: 'SPY', last: 500, status: 'ok' }] });

    render(<Harness />);

    await waitFor(() => expect(getMarketOverview).toHaveBeenCalledTimes(1));
    expect(getMarketOverview).toHaveBeenCalledWith(
      DEFAULT_SYMBOLS,
      expect.objectContaining({ forceRefresh: true })
    );
    await waitFor(() => expect(screen.getByTestId('symbols')).toHaveTextContent('SPY'));
  });

  it('does not show success with empty market data before initial request finishes', async () => {
    getMarketOverview.mockImplementationOnce(() => new Promise(() => {}));

    render(<Harness />);

    await waitFor(() => expect(getMarketOverview).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('symbols')).toHaveTextContent('');
  });

  it('shows cached market data immediately and refreshes latest data in background', async () => {
    seedMarketOverviewClientCacheForTests(DEFAULT_SYMBOLS, {
      items: [{ symbol: 'CACHE', last: 100, status: 'ok' }],
    });
    getMarketOverview.mockResolvedValue({ items: [{ symbol: 'FRESH', last: 101, status: 'ok' }] });

    render(<Harness />);

    expect(screen.getByTestId('symbols')).toHaveTextContent('CACHE');
    await waitFor(() => expect(getMarketOverview).toHaveBeenCalledTimes(1));
    expect(getMarketOverview).toHaveBeenCalledWith(
      DEFAULT_SYMBOLS,
      expect.objectContaining({ forceRefresh: true })
    );
    await waitFor(() => expect(screen.getByTestId('symbols')).toHaveTextContent('FRESH'));
  });

  it('forces market refresh when refresh button is clicked', async () => {
    getMarketOverview
      .mockResolvedValueOnce({ items: [{ symbol: 'SPY', last: 500, status: 'ok' }] })
      .mockResolvedValueOnce({ items: [{ symbol: 'QQQ', last: 400, status: 'ok' }] });

    render(<Harness />);

    await waitFor(() => expect(screen.getByTestId('symbols')).toHaveTextContent('SPY'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    });

    expect(getMarketOverview).toHaveBeenLastCalledWith(
      DEFAULT_SYMBOLS,
      expect.objectContaining({ forceRefresh: true })
    );
    await waitFor(() => expect(screen.getByTestId('symbols')).toHaveTextContent('QQQ'));
  });

  it('does not let an older market request overwrite a newer refresh result', async () => {
    let resolveInitialRequest;
    getMarketOverview.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitialRequest = resolve;
        })
    );
    getMarketOverview.mockResolvedValueOnce({
      items: [{ symbol: 'FRESH', last: 101, status: 'ok' }],
    });

    render(<Harness />);

    await waitFor(() => expect(getMarketOverview).toHaveBeenCalledTimes(1));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    });

    await waitFor(() => expect(screen.getByTestId('symbols')).toHaveTextContent('FRESH'));

    await act(async () => {
      resolveInitialRequest({ items: [{ symbol: 'STALE', last: 99, status: 'ok' }] });
    });

    expect(screen.getByTestId('symbols')).toHaveTextContent('FRESH');
  });
});
