import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import CandlestickPriceChart from './CandlestickPriceChart';
import {
  buildXAxisTicks,
  DOWN_COLOR,
  LAST_PRICE_COLOR,
  filterPricePointsByRange,
  NEUTRAL_COLOR,
  normalizePricePoints,
  PRICE_RANGE_OPTIONS,
  resolveYoyPriceWindow,
  UP_COLOR,
} from './priceChartUtils';

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

  it('orders ranges from smallest to largest and filters YTD from January 1', () => {
    expect(PRICE_RANGE_OPTIONS.map((option) => option.key)).toEqual([
      '1W',
      '1M',
      '3M',
      'YTD',
      '1Y',
    ]);

    const points = filterPricePointsByRange(
      [
        { date: '2025-12-31', open: 9, high: 10, low: 8, close: 9.5, volume: 900 },
        { date: '2026-01-02', open: 10, high: 11, low: 9, close: 10.5, volume: 1000 },
        { date: '2026-06-05', open: 12, high: 13, low: 11, close: 12.5, volume: 1200 },
      ],
      'YTD'
    );

    expect(points.map((point) => point.date)).toEqual(['2026-01-02', '2026-06-05']);
  });

  it('renders up, down, and flat candles with a minimum body height', () => {
    const { container } = render(<CandlestickPriceChart points={POINTS} ticker="TEST" />);

    expect(
      screen.getByRole('img', { name: 'OHLC candlestick price chart with integrated volume' })
    ).toBeTruthy();

    const bodies = Array.from(
      container.querySelectorAll('rect:not([data-testid="volume-bar"])')
    ).slice(1);
    expect(bodies).toHaveLength(3);
    expect(bodies.map((body) => body.getAttribute('fill'))).toEqual([
      UP_COLOR,
      DOWN_COLOR,
      NEUTRAL_COLOR,
    ]);
    expect(Number(bodies[2].getAttribute('height'))).toBeGreaterThanOrEqual(2);
  });

  it('uses dense candle spacing for 1W instead of leaving large gaps', () => {
    const weekPoints = Array.from({ length: 5 }, (_, index) => ({
      date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      open: 10 + index,
      high: 12 + index,
      low: 9 + index,
      close: 11 + index,
      volume: 1000 + index,
    }));
    const { container } = render(
      <CandlestickPriceChart points={weekPoints} ticker="TEST" rangeKey="1W" />
    );

    const bodies = Array.from(
      container.querySelectorAll('rect:not([data-testid="volume-bar"])')
    ).slice(1);
    expect(Number(bodies[0].getAttribute('width'))).toBeGreaterThan(100);
  });

  it('shows compact OHLCV detail for the nearest hovered candle', () => {
    render(<CandlestickPriceChart points={POINTS} ticker="TEST" />);
    const chart = screen.getByRole('img', {
      name: 'OHLC candlestick price chart with integrated volume',
    });
    mockChartRect(chart, 1000, 320);

    fireEvent.mouseMove(chart, { clientX: 460, clientY: 100 });

    const tooltip = screen.getByTestId('candlestick-tooltip');
    expect(within(tooltip).getByText('2026-01-02')).toBeTruthy();
    // Axis labels drop the year (formatXAxisDate → MM-DD).
    expect(screen.getByText('01-03')).toBeTruthy();
    expect(within(tooltip).getByText('O')).toBeTruthy();
    expect(within(tooltip).getByText('H')).toBeTruthy();
    expect(within(tooltip).getByText('L')).toBeTruthy();
    expect(within(tooltip).getByText('C')).toBeTruthy();
    expect(within(tooltip).getByText('Prev')).toBeTruthy();
    expect(within(tooltip).getByText('Vol')).toBeTruthy();
    expect(within(tooltip).getByText('Chg')).toBeTruthy();
  });

  it('renders integrated volume bars with axis section labels', () => {
    // The trading-data side panel now lives in TradingDataCard, not this chart.
    const { container } = render(<CandlestickPriceChart points={POINTS} ticker="TEST" />);

    const volumeBars = Array.from(container.querySelectorAll('[data-testid="volume-bar"]'));
    expect(volumeBars).toHaveLength(3);
    expect(screen.getByText('PRICE')).toBeTruthy();
    expect(screen.getByText('VOLUME')).toBeTruthy();
  });

  describe('referenceLines', () => {
    const lineY = (testId) => Number(screen.getByTestId(testId).getAttribute('y1'));

    it('draws horizontal lines on the chart price scale, ordered by value', () => {
      render(
        <CandlestickPriceChart
          points={POINTS}
          referenceLines={[
            { value: 11, label: 'MA50', color: '#3b82f6', testId: 'ref-low' },
            { value: 12, label: 'MA200', color: '#06b6d4', testId: 'ref-high' },
          ]}
        />
      );

      expect(lineY('ref-high')).toBeLessThan(lineY('ref-low')); // higher price = higher on screen
      expect(screen.getByText('MA50')).toBeTruthy();
      expect(screen.getByText('MA200')).toBeTruthy();
    });

    it('shares the chart scale: a line at the last close sits on the last-price line', () => {
      const { container } = render(
        <CandlestickPriceChart
          points={POINTS}
          referenceLines={[{ value: 10, label: 'MA', color: '#fff', testId: 'ref-last' }]}
        />
      );

      const lastPriceLine = container.querySelector(`line[stroke="${LAST_PRICE_COLOR}"]`);
      expect(lineY('ref-last')).toBe(Number(lastPriceLine.getAttribute('y1')));
    });

    it('skips lines outside the visible price range and non-finite values', () => {
      render(
        <CandlestickPriceChart
          points={POINTS}
          referenceLines={[
            { value: 500, label: 'FAR', color: '#fff', testId: 'ref-far' },
            { value: Number.NaN, label: 'NAN', color: '#fff', testId: 'ref-nan' },
            { value: null, label: 'NULL', color: '#fff', testId: 'ref-null' },
            { value: 11, label: 'IN', color: '#fff', testId: 'ref-in' },
          ]}
        />
      );

      expect(screen.queryByTestId('ref-far')).toBeNull();
      expect(screen.queryByTestId('ref-nan')).toBeNull();
      expect(screen.queryByTestId('ref-null')).toBeNull();
      expect(screen.getByTestId('ref-in')).toBeTruthy();
    });

    it('notes lines that sit off the chart scale instead of dropping them silently', () => {
      render(
        <CandlestickPriceChart
          points={POINTS}
          referenceLines={[
            { value: 500, label: 'FAR', color: '#fff' },
            { value: 0.01, label: 'LOW', color: '#fff' },
            { value: Number.NaN, label: 'NAN', color: '#fff' },
            { value: 11, label: 'IN', color: '#fff' },
          ]}
        />
      );

      const note = screen.getByTestId('reference-offscale-note');
      expect(note.textContent).toMatch(/FAR.*above/i);
      expect(note.textContent).toMatch(/LOW.*below/i);
      expect(note.textContent).not.toMatch(/NAN|IN/);
    });

    it('shows no off-scale note when every line is on the chart', () => {
      render(
        <CandlestickPriceChart
          points={POINTS}
          referenceLines={[{ value: 11, label: 'IN', color: '#fff' }]}
        />
      );

      expect(screen.queryByTestId('reference-offscale-note')).toBeNull();
    });

    it('renders nothing extra without referenceLines', () => {
      const { container } = render(<CandlestickPriceChart points={POINTS} />);

      expect(container.querySelectorAll('[data-testid^="ref-"]').length).toBe(0);
    });
  });
});
