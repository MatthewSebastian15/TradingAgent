import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BacktestSection } from './BacktestSection';
import { backtest } from '../../quantUtils';

// Records the props the section hands the chart so the date alignment can be asserted.
const chartProps = vi.hoisted(() => []);
vi.mock('../viz/LineChart', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    LineChart: (props) => {
      chartProps.push(props);
      return actual.LineChart(props);
    },
  };
});

const closes = Array.from({ length: 160 }, (_, i) => 100 + 10 * Math.sin(i / 3));
const dates = closes.map((_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));
const params = { fast: 20, slow: 50, lookback: 60, costBps: 0, oosFrac: 0 };

describe('BacktestSection', () => {
  afterEach(() => {
    cleanup();
    chartProps.length = 0;
  });

  it('bounds the SMA sliders so fast < slow is always true', () => {
    render(
      <BacktestSection
        strategy="sma"
        onStrategyChange={vi.fn()}
        params={params}
        onParamChange={vi.fn()}
        result={backtest(closes, 'sma', params)}
        dates={dates}
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
        dates={dates}
      />
    );
    expect(screen.getByText('Win Rate (per trade)')).toBeTruthy();
    expect(screen.getByText('Daily Hit Rate')).toBeTruthy();
    expect(screen.queryByText('Win Rate')).toBeNull();
  });

  it('draws a dated equity chart with strategy and buy & hold legend entries', () => {
    render(
      <BacktestSection
        strategy="sma"
        onStrategyChange={vi.fn()}
        params={params}
        onParamChange={vi.fn()}
        result={backtest(closes, 'sma', params)}
        dates={dates}
      />
    );
    expect(screen.getByRole('img', { name: 'Strategy equity versus buy and hold' })).toBeTruthy();
    expect(screen.getByText('Strategy')).toBeTruthy();
    expect(screen.getByText('Buy & hold')).toBeTruthy();
  });

  it('dates the equity and buy & hold points from the bar the evaluation starts at', () => {
    const result = backtest(closes, 'sma', params);
    render(
      <BacktestSection
        strategy="sma"
        onStrategyChange={vi.fn()}
        params={params}
        onParamChange={vi.fn()}
        result={result}
        dates={dates}
      />
    );
    const { series } = chartProps.at(-1);
    expect(result.startIndex).toBe(49);
    series.forEach((s) => {
      expect(s.points).toHaveLength(closes.length - result.startIndex);
      expect(s.points[0].x).toBe(dates[result.startIndex]);
      expect(s.points.at(-1).x).toBe(dates.at(-1));
    });
    expect(series.find((s) => s.id === 'strategy').points[0].y).toBe(1);
    expect(series.find((s) => s.id === 'buyhold').points[0].y).toBe(1);
  });
});
