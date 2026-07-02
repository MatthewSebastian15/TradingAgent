import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Portfolio from './Portfolio';

vi.mock('../api/market', () => ({
  getMarketQuotes: vi.fn(async () => ({ quotes: [] })),
}));
vi.mock('../utils/analysisHistoryApi', () => ({
  fetchAnalysisHistory: vi.fn(async () => [
    {
      request_id: 'r1',
      ticker: 'NVDA',
      decision: 'BUY',
      confidence_score: 70,
      trade_date: '2026-06-01',
    },
  ]),
}));
vi.mock('../hooks/useAnalysisHistoryStore', () => ({
  historyResourceId: (item) => item.request_id,
  normalizeBackendHistory: (items) => items,
  readHistory: vi.fn(async () => []),
  writeHistory: vi.fn(async () => {}),
  // Child components (SignalsSidebar, TrackedPositionsTable) import these too.
  decisionStyle: () => 'text-bloomberg-green',
  formatHistoryHorizon: (months) => (months ? `${months}M` : ''),
}));
vi.mock('../hooks/usePortfolioStore', () => ({
  usePortfolioStore: vi.fn(() => ({
    tracked: [],
    trackedIds: new Set(),
    track: vi.fn(),
    untrack: vi.fn(),
  })),
}));
vi.mock('../hooks/useHoldingsStore', () => ({
  useHoldingsStore: vi.fn(() => ({ holdings: [], add: vi.fn(), remove: vi.fn() })),
}));
vi.mock('../hooks/useWatchlistQuotes', () => ({
  useWatchlistQuotes: vi.fn(() => ({ quotesBySymbol: new Map(), trendsBySymbol: new Map() })),
}));

describe('Portfolio page', () => {
  afterEach(() => cleanup());

  it('renders the AI tracker tab with signals from history', async () => {
    render(<Portfolio />);

    expect(screen.getByText('■ Portfolio')).toBeTruthy();
    expect(screen.getByText(/No tracked recommendations yet/)).toBeTruthy();
    // Signal fetched from the backend history mock lands in the sidebar.
    expect(await screen.findByText('NVDA')).toBeTruthy();
    expect(screen.getByText('Signals')).toBeTruthy();
  });

  it('switches to My Holdings and hides the signals sidebar', async () => {
    render(<Portfolio />);
    await screen.findByText('NVDA');

    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    expect(screen.getByText(/No holdings yet/)).toBeTruthy();
    expect(screen.queryByText('Signals')).toBeNull();
  });
});
