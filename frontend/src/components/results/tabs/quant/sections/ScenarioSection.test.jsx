import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScenarioSection } from './ScenarioSection';

const dates = Array.from({ length: 30 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
);
const baseProps = {
  spot: 100,
  ccy: 'USD',
  symbol: 'AAPL',
  ewmaSigma: 0.02,
  beta: 1.2,
  benchLabel: 'S&P 500',
  benchIsSp500: true,
  benchWorst: [{ days: 1, startDate: dates[3], endDate: dates[4], returnPct: -4 }],
  stockWorst: [{ days: 20, startDate: dates[1], endDate: dates[21], returnPct: -15 }],
  regime: {
    current: 'Stressed',
    daysSince: 6,
    shifts: [{ index: 20, from: 'Calm', to: 'Stressed' }],
    labels: [],
  },
  pricePoints: dates.map((date, i) => ({ date, value: 100 + i })),
  segments: [
    { label: 'Calm', from: dates[0], to: dates[20] },
    { label: 'Stressed', from: dates[20], to: dates[29] },
  ],
};

describe('ScenarioSection', () => {
  afterEach(() => cleanup());

  it('groups sigma, historical, benchmark and own-worst rows', () => {
    render(<ScenarioSection {...baseProps} />);
    expect(screen.getByText('−3σ · 1D')).toBeTruthy();
    expect(screen.getByText('Black Monday — S&P 500, 1987-10-19')).toBeTruthy();
    expect(screen.getByText('Benchmark worst 1D')).toBeTruthy();
    expect(screen.getByText('Own worst 20D')).toBeTruthy();
  });

  it('prices a position and adds a custom shock row', () => {
    render(<ScenarioSection {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/Position value/), { target: { value: '10000' } });
    fireEvent.change(screen.getByLabelText(/Custom shock/), { target: { value: '-7' } });
    expect(screen.getByText('Custom shock')).toBeTruthy();
    expect(screen.getAllByText('-USD 700.00').length).toBeGreaterThan(0);
  });

  it('drops S&P days for other markets and explains IDX limits', () => {
    render(
      <ScenarioSection
        {...baseProps}
        symbol="BBCA.JK"
        benchLabel="IDX Composite"
        benchIsSp500={false}
      />
    );
    expect(screen.queryByText('Black Monday — S&P 500, 1987-10-19')).toBeNull();
    expect(screen.getByText(/auto-reject/)).toBeTruthy();
  });

  it('draws the regime timeline over price', () => {
    render(<ScenarioSection {...baseProps} />);
    expect(screen.getByRole('img', { name: 'Price with volatility regime timeline' })).toBeTruthy();
    expect(screen.getAllByText('Stressed').length).toBeGreaterThan(0);
  });
});
