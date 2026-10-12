import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import HoldingsSummaryBar from './HoldingsSummaryBar';

describe('HoldingsSummaryBar', () => {
  afterEach(() => cleanup());

  it('formats totals as currency with signed percent P/L', () => {
    render(
      <HoldingsSummaryBar
        summaries={[
          {
            currency: 'USD',
            count: 3,
            totalValue: 12345.6,
            totalCost: 10000,
            totalPL: 2345.6,
            totalPLPct: 0.23456,
            totalDayPL: -12.5,
          },
        ]}
      />
    );

    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('$12,345.60')).toBeTruthy();
    expect(screen.getByText('$10,000.00')).toBeTruthy();
    expect(screen.getByText('$2,345.60 (+23.46%)')).toBeTruthy();
    expect(screen.getByText('-$12.50').className).toContain('text-bloomberg-red');
  });

  it('renders dashes for missing values', () => {
    render(
      <HoldingsSummaryBar
        summaries={[
          {
            currency: 'USD',
            count: 0,
            totalValue: null,
            totalCost: null,
            totalPL: null,
            totalPLPct: null,
            totalDayPL: null,
          },
        ]}
      />
    );

    expect(screen.getByText('Positions · USD')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
  });

  it('renders an empty bar when there are no summaries', () => {
    render(<HoldingsSummaryBar summaries={[]} />);

    expect(screen.getByText('Positions · USD')).toBeTruthy();
  });

  it('renders one bar per currency with its own symbol and decimals', () => {
    render(
      <HoldingsSummaryBar
        summaries={[
          {
            currency: 'IDR',
            count: 1,
            tickerCount: 1,
            totalValue: 950000,
            totalCost: 900000,
            totalPL: 50000,
            totalPLPct: 0.0556,
            totalDayPL: 1000,
          },
          {
            currency: 'USD',
            count: 2,
            tickerCount: 2,
            totalValue: 1200,
            totalCost: 1000,
            totalPL: 200,
            totalPLPct: 0.2,
            totalDayPL: -5,
          },
        ]}
      />
    );

    expect(screen.getByText('Positions · IDR')).toBeTruthy();
    expect(screen.getByText('Positions · USD')).toBeTruthy();
    expect(screen.getByText('Rp 950,000')).toBeTruthy();
    expect(screen.getByText('$1,200.00')).toBeTruthy();
  });

  it('flags unpriced lots instead of hiding them', () => {
    render(
      <HoldingsSummaryBar
        summaries={[
          {
            currency: 'USD',
            count: 2,
            tickerCount: 2,
            unpricedCount: 1,
            totalValue: 1100,
            totalCost: 2000,
            totalPL: 100,
            totalPLPct: 0.1,
            totalDayPL: 0,
          },
        ]}
      />
    );

    expect(screen.getByText('1 unpriced')).toBeTruthy();
  });
});
