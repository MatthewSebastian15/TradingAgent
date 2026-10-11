import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Portfolio from './Portfolio';
import { useHoldingsStore } from '../hooks/useHoldingsStore';
import { usePortfolioStore } from '../hooks/usePortfolioStore';
import { useWatchlistQuotes } from '../hooks/useWatchlistQuotes';

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
  afterEach(() => {
    cleanup();
    usePortfolioStore.mockImplementation(() => ({
      tracked: [],
      trackedIds: new Set(),
      track: vi.fn(),
      untrack: vi.fn(),
    }));
    useHoldingsStore.mockImplementation(() => ({ holdings: [], add: vi.fn(), remove: vi.fn() }));
  });

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

  it('prices only the visible tab and never prices signal-only tickers', async () => {
    usePortfolioStore.mockImplementation(() => ({
      tracked: [{ id: 't1', ticker: 'aapl', decision: 'BUY', entry_price: 100 }],
      trackedIds: new Set(['t1']),
      track: vi.fn(),
      untrack: vi.fn(),
    }));
    useHoldingsStore.mockImplementation(() => ({
      holdings: [{ id: 'h1', ticker: 'bbca.jk', shares: 1, cost_basis: 1 }],
      add: vi.fn(),
      remove: vi.fn(),
    }));

    render(<Portfolio />);
    // NVDA comes from the mocked history feed: it is a signal, not a tracked position.
    await screen.findByText('NVDA');
    expect(useWatchlistQuotes.mock.calls.at(-1)[0]).toEqual(['AAPL']);

    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));
    expect(useWatchlistQuotes.mock.calls.at(-1)[0]).toEqual(['BBCA.JK']);
  });

  it('explains why adding a holding failed instead of failing silently', async () => {
    useHoldingsStore.mockImplementation(() => ({
      holdings: [],
      add: vi.fn(async () => ({ ok: false, reason: 'write_failed' })),
      remove: vi.fn(),
    }));
    render(<Portfolio />);
    await screen.findByText('NVDA');
    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Average cost per share'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/storage is full or blocked/i);
    expect(screen.getByLabelText('Ticker').value).toBe('AAPL'); // form kept so nothing is lost
  });
});
