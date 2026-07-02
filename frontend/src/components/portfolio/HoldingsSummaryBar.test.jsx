import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import HoldingsSummaryBar from './HoldingsSummaryBar';

describe('HoldingsSummaryBar', () => {
  afterEach(() => cleanup());

  it('formats totals as currency with signed percent P/L', () => {
    render(
      <HoldingsSummaryBar
        summary={{
          count: 3,
          totalValue: 12345.6,
          totalCost: 10000,
          totalPL: 2345.6,
          totalPLPct: 0.23456,
          totalDayPL: -12.5,
        }}
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
        summary={{
          count: 0,
          totalValue: null,
          totalCost: null,
          totalPL: null,
          totalPLPct: null,
          totalDayPL: null,
        }}
      />
    );

    expect(screen.getByText('Positions')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
  });
});
