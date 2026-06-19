import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AI_AGENT_MOCK_PATH, AI_AGENT_PATH } from './constants/routes';

async function renderApp(path, enableMock) {
  vi.stubEnv('VITE_ENABLE_MOCK', enableMock ? 'true' : 'false');
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
    await renderApp('/', false);

    expect(await screen.findByRole('button', { name: /home/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /research/i }).getAttribute('aria-disabled')
    ).toBeNull();
  }, 10000);

  it('registers the Research placeholder route', async () => {
    await renderApp('/research', false);

    expect(await screen.findByText('COMING SOON')).toBeTruthy();
    expect(screen.getByText('Research module is under development.')).toBeTruthy();
  });

  it('registers the Watchlist route', async () => {
    await renderApp('/watchlist', false);

    expect(await screen.findByRole('heading', { name: /watchlist/i })).toBeTruthy();
    expect(screen.getByText('No watchlist group yet')).toBeTruthy();
  });

  it('registers the ECON placeholder route', async () => {
    await renderApp('/econ', false);

    expect(await screen.findByText('COMING SOON')).toBeTruthy();
    expect(screen.getByText('Economic dashboard is under development.')).toBeTruthy();
  });

  it('registers the AI Agent route', async () => {
    await renderApp(AI_AGENT_PATH, false);

    expect(await screen.findByTitle('Configuration')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
  });

  it('does not register mock routes when mock mode is disabled', async () => {
    await renderApp(AI_AGENT_MOCK_PATH, false);

    expect(await screen.findByText('PAGE NOT FOUND')).toBeTruthy();
  });

  it('registers mock routes when mock mode is enabled', async () => {
    await renderApp(AI_AGENT_MOCK_PATH, true);

    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
  });

  it('prefetches market overview defaults on mount', async () => {
    vi.stubEnv('VITE_ENABLE_MOCK', 'false');
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

  it('reuses prefetched market overview cache in the hook', async () => {
    vi.resetModules();
    const payload = { items: [{ symbol: '^GSPC' }] };
    const getMarketOverview = vi.fn(() => Promise.resolve(payload));
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
    expect(getMarketOverview).toHaveBeenCalledTimes(1);
  });
});
