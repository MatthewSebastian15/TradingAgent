import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketMoversPanel from './MarketMoversPanel';

function buildMovers(overrides = {}) {
  return {
    country: 'United States',
    exchange: 'NASDAQ',
    setCountry: vi.fn(),
    setExchange: vi.fn(),
    data: { gainers: [], losers: [] },
    loading: false,
    error: null,
    refresh: vi.fn(),
    ...overrides,
  };
}

describe('MarketMoversPanel', () => {
  afterEach(() => cleanup());

  it('renders the active exchange and both movers tables', () => {
    render(<MarketMoversPanel movers={buildMovers()} />);

    expect(screen.getByText('NASDAQ · United States')).toBeTruthy();
    expect(screen.getByText('Top Gainers')).toBeTruthy();
    expect(screen.getByText('Top Losers')).toBeTruthy();
  });

  it('selects an exchange from the search dropdown', () => {
    const movers = buildMovers();
    render(<MarketMoversPanel movers={movers} />);

    const input = screen.getByLabelText('Search exchange or country');
    fireEvent.change(input, { target: { value: 'Indonesia' } });
    fireEvent.click(screen.getByRole('button', { name: /IDX - Indonesia/ }));

    expect(movers.setCountry).toHaveBeenCalledWith('Indonesia');
    expect(movers.setExchange).toHaveBeenCalledWith('IDX');
    expect(input.value).toBe('IDX - Indonesia');
  });

  it('refreshes with the matched exchange and the movers limit', () => {
    const movers = buildMovers();
    render(<MarketMoversPanel movers={movers} />);

    fireEvent.click(screen.getByRole('button', { name: /REFRESH/ }));

    expect(movers.refresh).toHaveBeenCalledWith({
      country: 'United States',
      exchange: 'NASDAQ',
      limit: 5,
    });
  });

  it('shows the fetch error with a retry button', () => {
    const movers = buildMovers({ error: 'movers unavailable' });
    render(<MarketMoversPanel movers={movers} />);

    expect(screen.getByText('movers unavailable')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'RETRY' }));
    expect(movers.refresh).toHaveBeenCalled();
  });
});
