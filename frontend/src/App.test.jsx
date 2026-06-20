import { cleanup, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_AGENT_PATH } from './constants/routes';

async function renderApp(path) {
  vi.resetModules();
  const { default: App } = await import('./App');

  window.history.pushState({}, '', path);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.doUnmock('./hooks/useMarketOverviewData');
  vi.doUnmock('./api/market');
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('App', () => {
  it('renders the dashboard route', async () => {
    await renderApp('/');

    expect(await screen.findByRole('button', { name: /home/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /research/i }).getAttribute('aria-disabled')
    ).toBeNull();
  }, 10000);

  it('registers the Research route', async () => {
    await renderApp('/research');

    expect(await screen.findByRole('heading', { name: /research/i })).toBeTruthy();
  });

  it('registers the Watchlist route', async () => {
    await renderApp('/watchlist');

    expect(await screen.findByRole('heading', { name: /watchlist/i })).toBeTruthy();
    expect(screen.getByText('No watchlist group yet')).toBeTruthy();
  });

  it('registers the ECON route', async () => {
    await renderApp('/econ');

    expect(await screen.findByRole('heading', { name: /economic/i })).toBeTruthy();
  });

  it('registers the AI Agent route', async () => {
    await renderApp(AI_AGENT_PATH);

    expect(await screen.findByTitle('Configuration')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
  });

  it('prefetches market overview defaults on mount', async () => {
    vi.resetModules();
    const prefetchMarketOverviewData = vi.fn(() => Promise.resolve(null));
    vi.doMock('./hooks/useMarketOverviewData', () => ({ prefetchMarketOverviewData }));
    const { MARKET_DEFAULT_SYMBOLS } = await import('./utils/marketDefaults');
    const { default: App } = await import('./App');

    render(<App />);

    expect(prefetchMarketOverviewData).toHaveBeenCalledWith(
      MARKET_DEFAULT_SYMBOLS,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('shows prefetched market overview cache and refreshes latest data in the hook', async () => {
    vi.resetModules();
    const cachedPayload = { items: [{ symbol: '^GSPC' }] };
    const freshPayload = { items: [{ symbol: '^IXIC' }] };
    const getMarketOverview = vi
      .fn()
      .mockResolvedValueOnce(cachedPayload)
      .mockResolvedValueOnce(freshPayload);
    vi.doMock('./api/market', () => ({ getMarketOverview }));
    const {
      clearMarketOverviewClientCacheForTests,
      prefetchMarketOverviewData,
      useMarketOverviewData,
    } = await import('./hooks/useMarketOverviewData');
    const symbols = ['^GSPC', '^IXIC', '^DJI'];

    clearMarketOverviewClientCacheForTests();
    await prefetchMarketOverviewData(symbols);

    function Probe() {
      const { data, loading } = useMarketOverviewData(symbols);
      return <div>{loading ? 'loading' : data.items[0]?.symbol}</div>;
    }

    render(<Probe />);

    expect(screen.getByText('^GSPC')).toBeTruthy();
    await waitFor(() => expect(getMarketOverview).toHaveBeenCalledTimes(2));
    expect(getMarketOverview).toHaveBeenLastCalledWith(
      symbols,
      expect.objectContaining({ forceRefresh: true })
    );
    expect(await screen.findByText('^IXIC')).toBeTruthy();
  });
});
