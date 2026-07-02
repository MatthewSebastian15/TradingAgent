import { describe, expect, it } from 'vitest';

import {
  DOWN_COLOR,
  MIN_RANGE_DAYS,
  NEUTRAL_COLOR,
  UP_COLOR,
  buildHistoricalMarketCapPoints,
  buildMaxDrawdownPoints,
  buildXAxisTicks,
  buildYAxisTicks,
  daysBetween,
  filterPricePointsByRange,
  formatCompactNumber,
  formatXAxisDate,
  getNiceStep,
  isIsoDate,
  isUpCandle,
  movementColor,
  movementLabel,
  normalizePricePoint,
  normalizePricePoints,
  rangeNeedsDetailFetch,
  rangeStartIsoDate,
  resolveYoyPriceWindow,
  subtractOneYearIsoDate,
  toNumber,
} from './priceChartUtils';

function point(date, close, extra = {}) {
  return { date, open: close, high: close, low: close, close, ...extra };
}

describe('toNumber / formatCompactNumber', () => {
  it('parses finite numbers only', () => {
    expect(toNumber('12.5')).toBe(12.5);
    expect(toNumber('')).toBeNull();
    expect(toNumber(null)).toBeNull();
    expect(toNumber('abc')).toBeNull();
  });

  it('abbreviates magnitudes', () => {
    expect(formatCompactNumber(2_500_000_000)).toBe('2.5B');
    expect(formatCompactNumber(1_200_000)).toBe('1.2M');
    expect(formatCompactNumber(3_400)).toBe('3.4K');
    expect(formatCompactNumber(999.6)).toBe('1000');
    expect(formatCompactNumber('x')).toBe('N/A');
  });
});

describe('date helpers', () => {
  it('formatXAxisDate shortens dates and datetimes', () => {
    expect(formatXAxisDate('2026-06-30')).toBe('06-30');
    expect(formatXAxisDate('2026-06-30T14:30:00')).toBe('06-30 14:30');
    expect(formatXAxisDate('')).toBe('');
  });

  it('isIsoDate matches yyyy-mm-dd only', () => {
    expect(isIsoDate('2026-06-30')).toBe(true);
    expect(isIsoDate('2026-6-30')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('subtractOneYearIsoDate handles leap days', () => {
    expect(subtractOneYearIsoDate('2026-06-30')).toBe('2025-06-30');
    expect(subtractOneYearIsoDate('2024-02-29')).toBe('2023-02-28');
    expect(subtractOneYearIsoDate('junk')).toBeNull();
  });

  it('daysBetween floors at MIN_RANGE_DAYS', () => {
    expect(daysBetween('2026-01-01', '2026-01-31')).toBe(30);
    expect(daysBetween('2026-01-01', '2026-01-02')).toBe(MIN_RANGE_DAYS);
    expect(daysBetween('bad', '2026-01-02')).toBe(MIN_RANGE_DAYS);
  });

  it('rangeStartIsoDate handles YTD and day ranges', () => {
    expect(rangeStartIsoDate('YTD', '2026-06-30')).toBe('2026-01-01');
    expect(rangeStartIsoDate('1M', '2026-06-30')).toBe('2026-05-30');
    expect(rangeStartIsoDate('1Y', 'junk')).toBeNull();
  });

  it('rangeNeedsDetailFetch only for short ranges', () => {
    expect(rangeNeedsDetailFetch('1W')).toBe(true);
    expect(rangeNeedsDetailFetch('1M')).toBe(true);
    expect(rangeNeedsDetailFetch('1Y')).toBe(false);
  });
});

describe('normalizePricePoint(s)', () => {
  it('rejects points missing date or OHLC values', () => {
    expect(normalizePricePoint(null)).toBeNull();
    expect(normalizePricePoint({ date: '2026-01-01', open: 1, high: 2, low: 1 })).toBeNull();
  });

  it('clamps high/low to contain open and close', () => {
    const result = normalizePricePoint({
      date: '2026-01-01',
      open: 10,
      high: 9,
      low: 11,
      close: 12,
    });
    expect(result.high).toBe(12);
    expect(result.low).toBe(9);
  });

  it('defaults adjusted_close to close and drops negative volume', () => {
    const result = normalizePricePoint({
      date: '2026-01-01',
      open: 1,
      high: 1,
      low: 1,
      close: 2,
      volume: -5,
    });
    expect(result.adjusted_close).toBe(2);
    expect(result.volume).toBeNull();
  });

  it('normalizePricePoints filters bad points and sorts by date', () => {
    const result = normalizePricePoints([point('2026-02-01', 2), null, point('2026-01-01', 1)]);
    expect(result.map((p) => p.date)).toEqual(['2026-01-01', '2026-02-01']);
    expect(normalizePricePoints('junk')).toEqual([]);
  });
});

describe('filterPricePointsByRange', () => {
  const points = [
    point('2025-01-15', 1),
    point('2025-12-01', 2),
    point('2026-06-01', 3),
    point('2026-06-30', 4),
  ];

  it('keeps only points inside the range window', () => {
    const filtered = filterPricePointsByRange(points, '3M');
    expect(filtered.map((p) => p.date)).toEqual(['2026-06-01', '2026-06-30']);
  });

  it('falls back to the last two points when the window is too sparse', () => {
    const sparse = [point('2020-01-01', 1), point('2020-01-02', 2), point('2026-06-30', 3)];
    const filtered = filterPricePointsByRange(sparse, '1W');
    expect(filtered).toHaveLength(2);
    expect(filtered.at(-1).date).toBe('2026-06-30');
  });

  it('returns short series unchanged', () => {
    expect(filterPricePointsByRange([point('2026-01-01', 1)], '1Y')).toHaveLength(1);
  });
});

describe('resolveYoyPriceWindow', () => {
  it('windows one year back from the effective end date', () => {
    const points = [point('2024-01-01', 1), point('2025-07-01', 2), point('2026-06-30', 3)];
    const result = resolveYoyPriceWindow({ trade_date: '2026-06-30' }, points);
    expect(result.endDate).toBe('2026-06-30');
    expect(result.startDate).toBe('2025-06-30');
    expect(result.points.map((p) => p.date)).toEqual(['2025-07-01', '2026-06-30']);
    expect(result.fallbackToLastTrade).toBe(false);
  });

  it('flags fallback when the requested trade date has no point', () => {
    const points = [point('2026-06-27', 1)];
    const result = resolveYoyPriceWindow({ trade_date: '2026-06-29' }, points);
    expect(result.endDate).toBe('2026-06-27');
    expect(result.fallbackToLastTrade).toBe(true);
  });
});

describe('axis ticks', () => {
  it('buildXAxisTicks always includes first and last points', () => {
    const points = Array.from({ length: 100 }, (_, i) =>
      point(`2026-01-${String((i % 28) + 1).padStart(2, '0')}`, i)
    );
    const ticks = buildXAxisTicks(points);
    expect(ticks[0].index).toBe(0);
    expect(ticks.at(-1).index).toBe(99);
    expect(buildXAxisTicks([])).toEqual([]);
  });

  it('getNiceStep snaps to 1/2/5 magnitudes', () => {
    expect(getNiceStep(10, 6)).toBe(2);
    expect(getNiceStep(100, 6)).toBe(20);
    expect(getNiceStep(0)).toBe(1);
  });

  it('buildYAxisTicks spans the range in nice steps, descending', () => {
    const ticks = buildYAxisTicks(0, 10);
    expect(ticks[0]).toBeGreaterThanOrEqual(10);
    expect(ticks.at(-1)).toBeLessThanOrEqual(0);
    expect(buildYAxisTicks(5, 5)).toEqual([5]);
    expect(buildYAxisTicks(NaN, 5)).toEqual([]);
  });
});

describe('candle movement', () => {
  const prev = point('2026-01-01', 10);

  it('classifies against previous close, falling back to open', () => {
    expect(isUpCandle(point('2026-01-02', 11), prev)).toBe(true);
    expect(isUpCandle(point('2026-01-02', 9), prev)).toBe(false);
    expect(isUpCandle({ ...point('2026-01-02', 5), open: 4 }, null)).toBe(true);
  });

  it('movementColor and movementLabel agree', () => {
    expect(movementColor(point('x', 11), prev)).toBe(UP_COLOR);
    expect(movementColor(point('x', 9), prev)).toBe(DOWN_COLOR);
    expect(movementColor(point('x', 10), prev)).toBe(NEUTRAL_COLOR);
    expect(movementLabel(point('x', 11), prev)).toBe('UP');
    expect(movementLabel(point('x', 9), prev)).toBe('DOWN');
    expect(movementLabel(point('x', 10), prev)).toBe('FLAT');
  });
});

describe('derived series', () => {
  it('buildHistoricalMarketCapPoints multiplies close by shares', () => {
    const result = buildHistoricalMarketCapPoints([point('2026-01-01', 10)], 3);
    expect(result).toEqual([{ date: '2026-01-01', value: 30 }]);
    expect(buildHistoricalMarketCapPoints([point('2026-01-01', 10)], 0)).toEqual([]);
  });

  it('buildMaxDrawdownPoints tracks drawdown from the running peak', () => {
    const result = buildMaxDrawdownPoints([
      point('2026-01-01', 100),
      point('2026-01-02', 80),
      point('2026-01-03', 120),
      point('2026-01-04', 60),
    ]);
    expect(result.map((p) => p.value)).toEqual([0, -20, 0, -50]);
    expect(buildMaxDrawdownPoints([point('2026-01-01', 1)])).toEqual([]);
  });
});
