import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import CandlestickPriceChart from './CandlestickPriceChart';
import {
  buildXAxisTicks,
  DOWN_COLOR,
  NEUTRAL_COLOR,
  normalizePricePoints,
  resolveYoyPriceWindow,
  UP_COLOR,
} from './priceChartUtils';
import VolumeChart from './VolumeChart';

const POINTS = [
  { date: '2026-01-01', open: 10, high: 13, low: 9, close: 12, volume: 1_000_000 },
  { date: '2026-01-02', open: 12, high: 13, low: 9, close: 10, volume: 2_000_000 },
  { date: '2026-01-03', open: 10, high: 12, low: 8, close: 10, volume: null },
];

function mockChartRect(svg, width, height) {
  Object.defineProperty(svg, 'getBoundingClientRect', {
    value: () => ({
      bottom: height,
      height,
      left: 0,
      right: width,
      top: 0,
      width,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
}

describe('CandlestickPriceChart', () => {
  afterEach(() => cleanup());

  it('filters invalid points, sorts dates, and sanitizes high-low values', () => {
    const points = normalizePricePoints([
      { date: '2026-01-02', open: 12, high: 9, low: 13, close: 10, volume: 200 },
      { date: '2026-01-01', open: 10, high: 11, low: 9, close: 10, volume: 100 },
      { date: '2026-01-03', open: null, high: 12, low: 8, close: 11, volume: 300 },
    ]);

    expect(points).toEqual([
      {
        date: '2026-01-01',
        open: 10,
        high: 11,
        low: 9,
        close: 10,
        adjusted_close: 10,
        volume: 100,
      },
      {
        date: '2026-01-02',
        open: 12,
        high: 13,
        low: 9,
        close: 10,
        adjusted_close: 10,
        volume: 200,
      },
    ]);
  });

  it('resolves the YOY window from requested trade date to the latest available trade row', () => {
    const window = resolveYoyPriceWindow({ trade_date: '2026-06-08', window: 'YOY' }, [
      { date: '2025-06-04', open: 9, high: 10, low: 8, close: 9.5, volume: 900 },
      { date: '2025-06-05', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
      { date: '2026-06-05', open: 12, high: 13, low: 11, close: 12.5, volume: 1200 },
      { date: '2026-06-09', open: 13, high: 14, low: 12, close: 13.5, volume: 1300 },
    ]);

    expect(window.requestedTradeDate).toBe('2026-06-08');
    expect(window.startDate).toBe('2025-06-05');
    expect(window.endDate).toBe('2026-06-05');
    expect(window.fallbackToLastTrade).toBe(true);
    expect(window.points.map((point) => point.date)).toEqual(['2025-06-05', '2026-06-05']);
  });

  it('builds sparse x-axis labels while keeping the first and last dates', () => {
    const points = Array.from({ length: 120 }, (_, index) => {
      const date = new Date('2026-01-01T00:00:00Z');
      date.setUTCDate(date.getUTCDate() + index);
      return { date: date.toISOString().slice(0, 10) };
    });

    const ticks = buildXAxisTicks(points);

    expect(ticks[0]).toMatchObject({ index: 0, label: '01-01' });
    expect(ticks.at(-1)).toMatchObject({ index: 119, label: '04-30' });
    expect(ticks.length).toBeGreaterThanOrEqual(7);
    expect(ticks.length).toBeLessThanOrEqual(9);
  });

  it('renders up, down, and flat candles with a minimum body height', () => {
    const { container } = render(<CandlestickPriceChart points={POINTS} ticker="TEST" />);

    expect(screen.getByRole('img', { name: 'OHLC candlestick price chart' })).toBeTruthy();

    const bodies = Array.from(container.querySelectorAll('rect'));
    expect(bodies).toHaveLength(3);
    expect(bodies.map((body) => body.getAttribute('fill'))).toEqual([
      UP_COLOR,
      DOWN_COLOR,
      NEUTRAL_COLOR,
    ]);
    expect(Number(bodies[2].getAttribute('height'))).toBeGreaterThanOrEqual(2);
  });

  it('shows complete OHLCV detail for the nearest hovered candle', () => {
    render(<CandlestickPriceChart points={POINTS} ticker="TEST" />);
    const chart = screen.getByRole('img', { name: 'OHLC candlestick price chart' });
    mockChartRect(chart, 1000, 320);

    fireEvent.mouseMove(chart, { clientX: 460, clientY: 100 });

    const tooltip = screen.getByTestId('candlestick-tooltip');
    expect(within(tooltip).getByText('2026-01-02')).toBeTruthy();
    expect(within(tooltip).getByText('Open')).toBeTruthy();
    expect(within(tooltip).getByText('High')).toBeTruthy();
    expect(within(tooltip).getByText('Low')).toBeTruthy();
    expect(within(tooltip).getByText('Close')).toBeTruthy();
    expect(within(tooltip).getByText('Adjusted Close')).toBeTruthy();
    expect(within(tooltip).getByText('Range')).toBeTruthy();
    expect(within(tooltip).getByText('Change')).toBeTruthy();
    expect(within(tooltip).getByText('Change %')).toBeTruthy();
    expect(within(tooltip).getByText('Volume')).toBeTruthy();
  });
});

describe('VolumeChart', () => {
  afterEach(() => cleanup());

  it('colors volume bars by candle direction and shows hover detail', () => {
    const { container } = render(<VolumeChart points={POINTS} />);
    const chart = screen.getByRole('img', { name: 'Trading volume chart' });
    mockChartRect(chart, 1000, 220);

    const bars = Array.from(container.querySelectorAll('rect'));
    expect(bars.map((bar) => bar.getAttribute('fill'))).toEqual([
      UP_COLOR,
      DOWN_COLOR,
      NEUTRAL_COLOR,
    ]);

    fireEvent.mouseMove(chart, { clientX: 466, clientY: 100 });

    const tooltip = screen.getByTestId('volume-tooltip');
    expect(within(tooltip).getByText('2026-01-02')).toBeTruthy();
    expect(within(tooltip).getByText('2.0M')).toBeTruthy();
    expect(within(tooltip).getByText('DOWN')).toBeTruthy();
  });
});
