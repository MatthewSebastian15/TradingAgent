import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeadlineStrip } from './HeadlineStrip';

const props = {
  symbol: 'AAPL',
  ccy: 'USD',
  last: 182.4,
  changePct: 12.3,
  startDate: '2025-09-12',
  endDate: '2026-09-11',
  observations: 251,
  benchLabel: 'S&P 500',
  rfPct: 4,
  rfSource: 'market',
  issues: [
    {
      code: 'extreme_move',
      count: 1,
      dates: ['2026-01-05'],
      message: '1 daily move(s) beyond ±40% (possible unadjusted split).',
    },
  ],
  vol: 25,
  shp: 1.2,
  dd: -18,
  var95: -2.1,
  regime: { label: 'Normal', tone: 'neutral' },
  hurstVal: 0.52,
};

describe('HeadlineStrip', () => {
  afterEach(() => cleanup());

  it('shows the data window, price, benchmark and warnings', () => {
    render(<HeadlineStrip {...props} onRfChange={vi.fn()} />);
    expect(screen.getByText('2025-09-12 → 2026-09-11 · 251 obs')).toBeTruthy();
    expect(screen.getByText('USD 182.40')).toBeTruthy();
    expect(screen.getByText('S&P 500')).toBeTruthy();
    expect(screen.getByText('Vol Regime')).toBeTruthy();
    expect(screen.getByText(/possible unadjusted split/)).toBeTruthy();
  });

  it('reports a manual risk-free rate as a fraction', () => {
    const onRfChange = vi.fn();
    render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    fireEvent.change(screen.getByLabelText('Risk-free rate, annual percent'), {
      target: { value: '4.5' },
    });
    expect(onRfChange.mock.calls[0][0]).toBeCloseTo(0.045, 12);
  });
});
