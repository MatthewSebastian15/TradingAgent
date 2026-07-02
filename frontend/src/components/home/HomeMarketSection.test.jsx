import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomeMarketSection from './HomeMarketSection';

const quotesBySymbol = new Map();
vi.mock('../../hooks/useWatchlistQuotes', () => ({
  useWatchlistQuotes: vi.fn(() => ({ quotesBySymbol })),
}));

describe('HomeMarketSection', () => {
  afterEach(() => {
    cleanup();
    quotesBySymbol.clear();
  });

  it('renders one row per asset class', () => {
    const { container } = render(<HomeMarketSection />);

    expect(screen.getByRole('heading', { name: 'Market' })).toBeTruthy();
    for (const label of ['EQUITIES', 'FX', 'COMMODITIES', 'FIXED INCOME', 'CRYPTO']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(container.querySelectorAll('.grid').length).toBe(5);
  });

  it('colors the change by sign once quotes arrive', async () => {
    const { useWatchlistQuotes } = await import('../../hooks/useWatchlistQuotes');
    useWatchlistQuotes.mockImplementation((symbols) => ({
      quotesBySymbol: new Map(
        symbols.map((symbol, index) => [
          symbol,
          { price: 100, chg: index === 0 ? '+1.50%' : '-2.00%' },
        ])
      ),
    }));
    render(<HomeMarketSection />);

    expect(screen.getByText('+1.50%').className).toContain('text-bloomberg-green');
    expect(screen.getAllByText('-2.00%')[0].className).toContain('text-bloomberg-red');
  });
});
