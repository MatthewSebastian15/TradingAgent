import { cleanup, render, screen } from '@testing-library/react';
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

    // Both top navbar and left sidebar render nav buttons — use getAllByRole
    expect((await screen.findAllByRole('button', { name: /home/i })).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: /ai agent/i }).length).toBeGreaterThan(0);
    const [researchBtn] = screen.getAllByRole('button', { name: /research/i });
    expect(researchBtn.getAttribute('aria-disabled')).toBeNull();
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
    // Both top navbar and left sidebar have an AI Agent button
    expect(screen.getAllByRole('button', { name: /ai agent/i }).length).toBeGreaterThan(0);
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

  it('shows prefetched market overview cache immediately without a second fetch', async () => {
    vi.resetModules();
    const cachedPayload = { items: [{ symbol: '^GSPC' }] };
    const getMarketOverview = vi.fn().mockResolvedValueOnce(cachedPayload);
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

    // Prefetched data renders immediately; mount does not fire a second backend call.
    expect(screen.getByText('^GSPC')).toBeTruthy();
    expect(getMarketOverview).toHaveBeenCalledTimes(1);
  });
});
