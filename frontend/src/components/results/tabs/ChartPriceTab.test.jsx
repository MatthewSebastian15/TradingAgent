import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ChartPriceTab from './ChartPriceTab';

vi.mock('../../../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  readHttpError: async () => 'error',
}));

function buildPoints(count) {
  return Array.from({ length: count }, (_, i) => {
    const day = String((i % 27) + 1).padStart(2, '0');
    const month = String(Math.floor(i / 27) + 1).padStart(2, '0');
    const base = 100 + i;
    return {
      date: `2026-${month}-${day}`,
      open: base,
      high: base + 2,
      low: base - 2,
      close: base + 1,
      volume: 1_000_000,
    };
  });
}

const RESULT = {
  ticker: 'AAPL',
  price_chart: {
    available: true,
    ticker: 'AAPL',
    trade_date: '2026-04-15',
    currency: 'USD',
    source: 'yfinance',
    points: buildPoints(90),
  },
};

describe('ChartPriceTab', () => {
  afterEach(() => cleanup());

  it('shows the unavailable notice when chart data is missing', () => {
    render(<ChartPriceTab result={{ price_chart: { available: false, warning: 'No OHLC.' } }} />);

    expect(screen.getByText('CHART DATA UNAVAILABLE')).toBeTruthy();
    expect(screen.getByText('No OHLC.')).toBeTruthy();
  });

  it('renders the chart card, source label, and range controls', () => {
    render(<ChartPriceTab result={RESULT} />);

    expect(screen.getByText('CHART & PRICE')).toBeTruthy();
    expect(screen.getByText(/Source: yfinance/)).toBeTruthy();
    for (const label of ['1W', '1M', '3M', 'YTD', '1Y']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // Default range is 1Y.
    expect(screen.getByRole('button', { name: '1Y' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('switches the active range on click', () => {
    render(<ChartPriceTab result={RESULT} />);

    fireEvent.click(screen.getByRole('button', { name: '3M' }));

    expect(screen.getByRole('button', { name: '3M' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: '1Y' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('surfaces a chart warning without hiding the chart', () => {
    const result = {
      ...RESULT,
      price_chart: { ...RESULT.price_chart, warning: 'Partial history only.' },
    };
    render(<ChartPriceTab result={result} />);

    expect(screen.getByText('CHART DATA WARNING')).toBeTruthy();
    expect(screen.getByText('Partial history only.')).toBeTruthy();
    expect(screen.getByText('CHART & PRICE')).toBeTruthy();
  });

  it('renders the market cap and drawdown metric charts', () => {
    render(<ChartPriceTab result={RESULT} />);

    expect(screen.getByText('Historical Market Cap')).toBeTruthy();
    expect(screen.getByText('Max Drawdown')).toBeTruthy();
  });
});
