import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomePortfolioSection from './HomePortfolioSection';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';

vi.mock('../../hooks/useHoldingsStore', () => ({
  useHoldingsStore: () => ({
    holdings: [{ id: 'h1', ticker: 'AAPL', shares: 2, cost_basis: 100 }],
  }),
}));
vi.mock('../../hooks/useWatchlistQuotes', () => ({
  useWatchlistQuotes: vi.fn(() => ({ quotesBySymbol: new Map([['AAPL', { price: 110 }]]) })),
}));

describe('HomePortfolioSection', () => {
  afterEach(() => cleanup());

  it('prices holdings without requesting sparklines', () => {
    render(<HomePortfolioSection />);

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('+10.00%')).toBeTruthy();
    expect(useWatchlistQuotes).toHaveBeenCalledWith(['AAPL'], { trends: false });
  });
});
