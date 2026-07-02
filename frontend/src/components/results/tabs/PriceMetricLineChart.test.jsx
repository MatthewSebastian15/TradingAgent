import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import PriceMetricLineChart from './PriceMetricLineChart';

const POINTS = [
  { date: '2026-01-01', value: 100_000_000 },
  { date: '2026-01-02', value: 110_000_000 },
  { date: '2026-01-03', value: 105_000_000 },
];

describe('PriceMetricLineChart', () => {
  afterEach(() => cleanup());

  it('renders the empty message when fewer than two valid points exist', () => {
    render(<PriceMetricLineChart title="Market Cap" points={[]} emptyMessage="No data here." />);

    expect(screen.getByText('Market Cap')).toBeTruthy();
    expect(screen.getByText('No data here.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('filters invalid points and falls back to empty when only one survives', () => {
    render(
      <PriceMetricLineChart
        title="Market Cap"
        points={[
          { date: '2026-01-01', value: 100 },
          { date: '', value: 200 },
          { date: '2026-01-03', value: Number.NaN },
        ]}
      />
    );

    expect(screen.getByText('Data is unavailable.')).toBeTruthy();
  });

  it('draws the chart with a line path and last-value readout', () => {
    const { container } = render(
      <PriceMetricLineChart title="Market Cap" subtitle="YOY" points={POINTS} currency="USD" />
    );

    const svg = screen.getByRole('img', { name: 'Market Cap' });
    expect(svg).toBeTruthy();
    expect(screen.getByText('YOY')).toBeTruthy();
    expect(container.querySelector('path')).toBeTruthy();
    // LAST readout + tooltip both show the compact-currency last value.
    expect(screen.getAllByText('$105.0M').length).toBeGreaterThan(0);
    expect(screen.getByTestId('price-metric-tooltip').textContent).toContain('2026-01-03');
  });

  it('formats percent and non-USD currency values', () => {
    const percentPoints = [
      { date: '2026-01-01', value: -3.5 },
      { date: '2026-01-02', value: -1.25 },
    ];
    render(<PriceMetricLineChart title="Drawdown" points={percentPoints} valueType="percent" />);
    expect(screen.getAllByText('-1.25%').length).toBeGreaterThan(0);

    render(
      <PriceMetricLineChart title="Cap IDR" points={POINTS} valueType="currency" currency="IDR" />
    );
    expect(screen.getAllByText('Rp 105.0M').length).toBeGreaterThan(0);
  });
});
