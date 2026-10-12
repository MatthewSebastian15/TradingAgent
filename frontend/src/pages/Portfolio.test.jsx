import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
vi.mock('../utils/marketBatch', async (importOriginal) => ({
  ...(await importOriginal()),
  withRetry: (run) => run(), // a real retry would wait 2 s on a transient failure
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
    useWatchlistQuotes.mockImplementation(() => ({
      quotesBySymbol: new Map(),
      trendsBySymbol: new Map(),
    }));
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

  it('does not show a failed quote as a total loss', async () => {
    useHoldingsStore.mockImplementation(() => ({
      holdings: [{ id: 'h1', ticker: 'AAPL', shares: 10, cost_basis: 100 }],
      add: vi.fn(),
      remove: vi.fn(),
    }));
    useWatchlistQuotes.mockImplementation(() => ({
      quotesBySymbol: new Map([['AAPL', { sym: 'AAPL', price: null, chg: 'N/A', error: true }]]),
      trendsBySymbol: new Map(),
    }));

    render(<Portfolio />);
    await screen.findByText('NVDA');
    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    expect(screen.queryByText(/-100\.00%/)).toBeNull();
    expect(screen.getByText('1 unpriced')).toBeTruthy();
  });

  it('disables ADD while a holding is being saved', async () => {
    useHoldingsStore.mockImplementation(() => ({
      holdings: [],
      pending: true,
      add: vi.fn(),
      remove: vi.fn(),
    }));
    render(<Portfolio />);
    await screen.findByText('NVDA');
    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    expect(screen.getByRole('button', { name: /Add/ }).disabled).toBe(true);
  });

  it('shows the specific field error from the shared validation', async () => {
    const add = vi.fn();
    useHoldingsStore.mockImplementation(() => ({
      holdings: [],
      pending: false,
      add,
      remove: vi.fn(),
    }));
    render(<Portfolio />);
    await screen.findByText('NVDA');
    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'AAPL' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Average cost per share'), { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /cannot be negative|must be a number/
    );
    expect(add).not.toHaveBeenCalled();
  });

  it('refuses an ambiguous share count like 10.000 instead of saving 10', async () => {
    const add = vi.fn();
    useHoldingsStore.mockImplementation(() => ({
      holdings: [],
      pending: false,
      add,
      remove: vi.fn(),
    }));
    render(<Portfolio />);
    await screen.findByText('NVDA');
    fireEvent.click(screen.getByRole('button', { name: 'My Holdings' }));

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'BBCA.JK' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '10.000' } });
    fireEvent.change(screen.getByLabelText('Average cost per share'), {
      target: { value: '9000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/ambiguous/);
    expect(add).not.toHaveBeenCalled();
  });

  it('does not block the signals sidebar on the network when a saved list exists', async () => {
    const { readHistory } = await import('../hooks/useAnalysisHistoryStore');
    const { fetchAnalysisHistory } = await import('../utils/analysisHistoryApi');
    readHistory.mockResolvedValueOnce([{ request_id: 'saved', ticker: 'MSFT', decision: 'BUY' }]);
    fetchAnalysisHistory.mockImplementationOnce(() => new Promise(() => {})); // never answers

    render(<Portfolio />);

    expect(await screen.findByText('MSFT')).toBeTruthy();
  });

  it('passes the analysis stop-loss and take-profit into the tracked record', async () => {
    const { fetchAnalysisHistory } = await import('../utils/analysisHistoryApi');
    const { getMarketQuotes } = await import('../api/market');
    fetchAnalysisHistory.mockResolvedValueOnce([
      { request_id: 'r9', ticker: 'NVDA', decision: 'BUY', stop_loss: 90, take_profit: 130 },
    ]);
    getMarketQuotes.mockResolvedValueOnce({ quotes: [{ sym: 'NVDA', price: 100 }] });
    const track = vi.fn(async () => ({ ok: true }));
    usePortfolioStore.mockImplementation(() => ({
      tracked: [],
      trackedIds: new Set(),
      track,
      untrack: vi.fn(),
    }));

    render(<Portfolio />);
    fireEvent.click(await screen.findByLabelText('Track NVDA'));

    await waitFor(() =>
      expect(track).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'r9', entry_price: 100, stop_loss: 90, take_profit: 130 })
      )
    );
  });

  it('shows a timeout-specific message when the price request times out', async () => {
    const { getMarketQuotes } = await import('../api/market');
    getMarketQuotes.mockRejectedValueOnce(Object.assign(new Error('t'), { code: 'TIMEOUT' }));

    render(<Portfolio />);
    fireEvent.click(await screen.findByLabelText('Track NVDA'));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'The price request timed out. Try again.'
    );
  });

  it('reports a missing live price for the ticker', async () => {
    const { getMarketQuotes } = await import('../api/market');
    getMarketQuotes.mockResolvedValueOnce({ quotes: [{ sym: 'NVDA', price: null, error: true }] });

    render(<Portfolio />);
    fireEvent.click(await screen.findByLabelText('Track NVDA'));

    expect((await screen.findByRole('alert')).textContent).toBe('No live price for NVDA.');
  });
});
