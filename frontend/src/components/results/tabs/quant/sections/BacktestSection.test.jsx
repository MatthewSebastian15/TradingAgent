import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BacktestSection } from './BacktestSection';
import { backtest } from '../../quantUtils';

const closes = Array.from({ length: 160 }, (_, i) => 100 + 10 * Math.sin(i / 3));
const params = { fast: 20, slow: 50, lookback: 60, costBps: 0, oosFrac: 0 };

describe('BacktestSection', () => {
  afterEach(() => cleanup());

  it('bounds the SMA sliders so fast < slow is always true', () => {
    render(
      <BacktestSection
        strategy="sma"
        onStrategyChange={vi.fn()}
        params={params}
        onParamChange={vi.fn()}
        result={backtest(closes, 'sma', params)}
      />
    );
    expect(screen.getByLabelText(/Fast SMA/).getAttribute('max')).toBe('49');
    expect(screen.getByLabelText(/Slow SMA/).getAttribute('min')).toBe('21');
  });

  it('labels per-trade win rate and daily hit rate separately', () => {
    render(
      <BacktestSection
        strategy="sma"
        onStrategyChange={vi.fn()}
        params={params}
        onParamChange={vi.fn()}
        result={backtest(closes, 'sma', params)}
      />
    );
    expect(screen.getByText('Win Rate (per trade)')).toBeTruthy();
    expect(screen.getByText('Daily Hit Rate')).toBeTruthy();
    expect(screen.queryByText('Win Rate')).toBeNull();
  });
});
