import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomePortfolioSection from './HomePortfolioSection';
import { useHoldingsStore } from '../../hooks/useHoldingsStore';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';

vi.mock('../../hooks/useHoldingsStore', () => ({ useHoldingsStore: vi.fn() }));
vi.mock('../../hooks/useWatchlistQuotes', () => ({ useWatchlistQuotes: vi.fn() }));

const AAPL = { id: 'h1', ticker: 'AAPL', shares: 2, cost_basis: 100 };
const BBCA = { id: 'h2', ticker: 'BBCA.JK', shares: 100, cost_basis: 9000 };

function arrange(holdings, quotes) {
  useHoldingsStore.mockImplementation(() => ({ holdings }));
  useWatchlistQuotes.mockImplementation(() => ({ quotesBySymbol: new Map(quotes) }));
}

describe('HomePortfolioSection', () => {
  afterEach(() => cleanup());

  it('prices holdings without requesting sparklines', () => {
    arrange([AAPL], [['AAPL', { price: 110 }]]);
    render(<HomePortfolioSection />);

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('+10.00%')).toBeTruthy();
    expect(useWatchlistQuotes).toHaveBeenCalledWith(['AAPL'], { trends: false });
  });

  it('shows no P/L for a failed quote and prices IDR holdings in Rp', () => {
    arrange(
      [AAPL, BBCA],
      [
        ['AAPL', { price: null, error: true }],
        ['BBCA.JK', { price: 9500, currency: 'IDR' }],
      ]
    );
    render(<HomePortfolioSection />);

    expect(screen.queryByText('-100.00%')).toBeNull();
    expect(screen.getByText('Rp 9,500')).toBeTruthy();
    expect(screen.getByText('+5.56%')).toBeTruthy(); // (9500-9000)/9000
  });
});
