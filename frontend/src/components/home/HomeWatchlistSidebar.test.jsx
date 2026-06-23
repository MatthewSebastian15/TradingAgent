import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomeWatchlistSidebar from './HomeWatchlistSidebar';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';

vi.mock('../../hooks/useWatchlistStore', () => ({ useWatchlistStore: vi.fn() }));
vi.mock('../../hooks/useWatchlistQuotes', () => ({ useWatchlistQuotes: vi.fn() }));

const items = [
  { symbol: 'AAPL', name: 'Apple', exchange: 'NASDAQ' },
  { symbol: 'TSLA', name: 'Tesla', exchange: 'NASDAQ' },
];

function setup({ quotes = {}, loadingQuotes = false, error = '', group = { items } } = {}) {
  useWatchlistStore.mockReturnValue({ activeGroup: group });
  useWatchlistQuotes.mockReturnValue({
    quotesBySymbol: new Map(Object.entries(quotes)),
    trendsBySymbol: new Map(),
    loadingQuotes,
    loadingTrends: false,
    error,
    refresh: vi.fn(),
  });
  return render(<HomeWatchlistSidebar />);
}

describe('HomeWatchlistSidebar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('searches by symbol', () => {
    setup({ quotes: { AAPL: { price: 1, chg: '+1%', pos: true }, TSLA: { price: 2, chg: '-1%' } } });
    expect(screen.getByText('AAPL')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search watchlist'), { target: { value: 'tsla' } });
    expect(screen.queryByText('AAPL')).not.toBeInTheDocument();
    expect(screen.getByText('TSLA')).toBeInTheDocument();
  });

  it('sorts by last price descending when the Last header is clicked', () => {
    setup({ quotes: { AAPL: { price: 1, chg: '+1%' }, TSLA: { price: 2, chg: '-1%' } } });
    fireEvent.click(screen.getByRole('button', { name: /Last/ }));
    const tickers = screen.getAllByText(/AAPL|TSLA/).map((n) => n.textContent);
    expect(tickers[0]).toBe('TSLA'); // higher price first
  });

  it('derives ERR status for a failed quote', () => {
    setup({ quotes: { AAPL: { error: true, price: null, chg: 'N/A' } }, group: { items: [items[0]] } });
    expect(screen.getByText('ERR')).toBeInTheDocument();
  });

  it('shows the skeleton while first load is in flight', () => {
    setup({ loadingQuotes: true });
    expect(screen.getByLabelText('Loading watchlist')).toBeInTheDocument();
  });

  it('shows an empty state with no tickers', () => {
    setup({ group: { items: [] } });
    expect(screen.getByText(/No tickers yet/)).toBeInTheDocument();
  });

  it('shows the error state', () => {
    setup({ error: 'boom' });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('expands a row to reveal detail metrics on click', () => {
    setup({ quotes: { AAPL: { price: 10, chg: '+1%', volume: 1500000 } }, group: { items: [items[0]] } });
    fireEvent.click(screen.getByRole('button', { expanded: false }));
    const detail = screen.getByText('Volume').closest('dl');
    expect(within(detail).getByText('1.5M')).toBeInTheDocument();
  });
});
