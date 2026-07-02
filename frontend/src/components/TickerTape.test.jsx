import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TickerTape from './TickerTape';
import { useTickerQuotes } from '../hooks/useTickerQuotes';

vi.mock('../hooks/useTickerQuotes', () => ({
  EMPTY_CHANGE: '—',
  useTickerQuotes: vi.fn(),
  fallbackTickerQuotes: vi.fn(() => [
    { sym: 'FALLBACK', label: 'FALLBACK', price: null, chg: '—' },
  ]),
}));

describe('TickerTape', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders quotes with formatted prices and change colors', () => {
    useTickerQuotes.mockReturnValue({
      fetchError: false,
      quotes: [
        { sym: 'AAPL', label: 'AAPL', price: 123.456, chg: '+1.2%', pos: true },
        { sym: '^GSPC', label: 'S&P 500', price: 5432.1, chg: '-0.5%', pos: false },
        { sym: '^TNX', label: 'US 10Y', price: 44.3, chg: '+0.1%', pos: true },
      ],
    });
    render(<TickerTape />);

    // Match the component's locale-dependent formatting exactly.
    const plainPrice = (123.456).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const compactPrice = Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(5432.1);

    expect(screen.getByLabelText('Global market ticker tape')).toBeTruthy();
    expect(screen.getByText(plainPrice)).toBeTruthy();
    // >= 1000 uses compact notation; ^TNX divides by 10 and shows percent.
    expect(screen.getByText(compactPrice)).toBeTruthy();
    expect(screen.getByText('4.43%')).toBeTruthy();
    expect(screen.getByText('+1.2%').className).toContain('text-bloomberg-green');
    expect(screen.getByText('-0.5%').className).toContain('text-bloomberg-red');
  });

  it('falls back to placeholder quotes and mutes loading changes', () => {
    useTickerQuotes.mockReturnValue({ fetchError: false, quotes: [] });
    render(<TickerTape />);

    expect(screen.getByText('FALLBACK')).toBeTruthy();
    expect(screen.getAllByText('—')[0].className).toContain('text-bloomberg-muted');
  });

  it('shows the market-data warning toast on fetch error', () => {
    useTickerQuotes.mockReturnValue({ fetchError: true, quotes: [] });
    render(<TickerTape />);

    expect(screen.getByText('MARKET DATA UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('Backend offline or yfinance error.')).toBeTruthy();
  });
});
