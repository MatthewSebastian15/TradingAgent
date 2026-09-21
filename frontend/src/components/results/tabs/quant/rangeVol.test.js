import { describe, expect, it } from 'vitest';

import { ewmaVolSeries, garmanKlassVol, parkinsonVol, volCone, yangZhangVol } from './rangeVol';
import { zipRollingToDates } from './series';
import { ewmaSigmaDaily, ewmaVol, rollingVol, simpleReturns } from './stats';

const bar = { open: 100, high: 102, low: 98, close: 100 };
const bars = Array.from({ length: 30 }, () => ({ ...bar }));
const hl2 = Math.log(102 / 98) ** 2;

describe('range estimators', () => {
  it('Parkinson = sqrt(mean(ln(H/L)^2) / (4 ln 2) x ppy)', () => {
    expect(parkinsonVol(bars)).toBeCloseTo(Math.sqrt((hl2 / (4 * Math.LN2)) * 252) * 100, 10);
  });

  it('Garman-Klass with close = open reduces to 0.5 ln(H/L)^2', () => {
    expect(garmanKlassVol(bars)).toBeCloseTo(Math.sqrt(0.5 * hl2 * 252) * 100, 10);
  });

  it('Yang-Zhang with no gaps and no drift = (1-k) x Rogers-Satchell', () => {
    const n = bars.length - 1;
    const k = 0.34 / (1.34 + (n + 1) / (n - 1));
    const rs = Math.log(1.02) ** 2 + Math.log(0.98) ** 2;
    expect(yangZhangVol(bars)).toBeCloseTo(Math.sqrt((1 - k) * rs * 252) * 100, 10);
  });

  // Reference values computed independently (Python statistics.variance, sample n-1)
  // for bars with non-zero overnight gaps and open-to-close drift.
  const gapBars = [
    { open: 100, high: 103, low: 99, close: 101 },
    { open: 102, high: 105, low: 101, close: 104 },
    { open: 103, high: 106, low: 102, close: 105 },
    { open: 106, high: 108, low: 104, close: 105 },
  ];

  it('Yang-Zhang matches an independently computed value with gaps and drift', () => {
    expect(yangZhangVol(gapBars)).toBeCloseTo(42.01440115338465, 8);
  });

  it('ppy is the last parameter and scales by sqrt(ppy / 252)', () => {
    const scale = Math.sqrt(365 / 252);
    expect(yangZhangVol(gapBars, 365)).toBeCloseTo(50.56433961518173, 8);
    expect(parkinsonVol(bars, 365)).toBeCloseTo(parkinsonVol(bars) * scale, 10);
    expect(garmanKlassVol(bars, 365)).toBeCloseTo(garmanKlassVol(bars) * scale, 10);
  });

  it('Garman-Klass returns null when the daily variance is not positive', () => {
    // Inconsistent bar (high = low but close moved): variance term goes negative.
    const odd = Array.from({ length: 5 }, () => ({ open: 100, high: 100, low: 100, close: 110 }));
    expect(garmanKlassVol(odd)).toBeNull();
  });

  it('missing OHLC -> null', () => {
    expect(parkinsonVol([{ close: 1 }, { close: 2 }])).toBeNull();
    expect(yangZhangVol([bar, bar])).toBeNull();
  });

  it('needs 2 valid rows (3 for Yang-Zhang)', () => {
    expect(parkinsonVol([bar])).toBeNull();
    expect(garmanKlassVol([bar])).toBeNull();
    expect(parkinsonVol([bar, bar])).not.toBeNull();
    expect(yangZhangVol([bar, bar])).toBeNull();
    expect(yangZhangVol([bar, bar, bar])).not.toBeNull();
    expect(parkinsonVol(undefined)).toBeNull();
    expect(parkinsonVol([])).toBeNull();
  });

  it('skips rows with a non-finite or non-positive value', () => {
    const junk = [
      { ...bar, high: NaN },
      { ...bar, low: 0 },
      { ...bar, open: -1 },
      { ...bar, close: Infinity },
      { ...bar, open: null },
    ];
    expect(parkinsonVol([...junk, ...bars])).toBeCloseTo(parkinsonVol(bars), 12);
    expect(garmanKlassVol([...junk, ...bars])).toBeCloseTo(garmanKlassVol(bars), 12);
    expect(yangZhangVol([...junk, ...gapBars])).toBeCloseTo(yangZhangVol(gapBars), 12);
    expect(parkinsonVol(junk)).toBeNull();
  });
});

describe('volCone', () => {
  const closes = Array.from(
    { length: 300 },
    (_, i) => 100 * Math.exp(0.01 * Math.sin(i / 2) + i * 0.0005)
  );

  it('orders percentiles and reports the latest rolling value as current', () => {
    const cone = volCone(closes, [10, 21, 63]);
    expect(cone.map((c) => c.window)).toEqual([10, 21, 63]);
    for (const c of cone) {
      expect(c.min).toBeLessThanOrEqual(c.p25);
      expect(c.p25).toBeLessThanOrEqual(c.median);
      expect(c.median).toBeLessThanOrEqual(c.p75);
      expect(c.p75).toBeLessThanOrEqual(c.max);
      expect(c.current).toBeCloseTo(rollingVol(closes, c.window).at(-1), 10);
      expect(c.percentile).toBeGreaterThan(0);
      expect(c.percentile).toBeLessThanOrEqual(100);
    }
  });

  it('skips windows longer than the history', () => {
    expect(volCone(closes.slice(0, 40), [10, 252]).map((c) => c.window)).toEqual([10]);
  });

  it('returns [] for empty or short history and never throws', () => {
    expect(volCone([])).toEqual([]);
    expect(volCone(undefined)).toEqual([]);
    expect(volCone([100, 101, 102])).toEqual([]);
  });

  it('uses the ppy argument', () => {
    const [d] = volCone(closes, [21]);
    const [c] = volCone(closes, [21], 365);
    expect(c.current).toBeCloseTo(d.current * Math.sqrt(365 / 252), 10);
  });
});

describe('ewmaVolSeries', () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + 5 * Math.sin(i));

  it('ends at the same value as ewmaVol (same seeding as ewmaSigmaDaily)', () => {
    const series = ewmaVolSeries(simpleReturns(closes));
    expect(series).toHaveLength(79 - 20 + 1);
    expect(series.at(-1)).toBeCloseTo(ewmaVol(closes), 10);
  });

  it('zips so the last value lands on the last date', () => {
    const dates = closes.map((_, i) => `2024-01-${String(i + 1).padStart(3, '0')}`);
    const series = ewmaVolSeries(simpleReturns(closes));
    const zipped = zipRollingToDates(series, dates, 20);
    expect(zipped).toHaveLength(series.length);
    expect(zipped.at(-1)).toEqual({ date: dates.at(-1), value: series.at(-1) });
    expect(zipped[0].date).toBe(dates[20]);
  });

  it('returns [] when there are fewer returns than the seed window', () => {
    expect(ewmaVolSeries([0.01, 0.02])).toEqual([]);
    expect(ewmaVolSeries([])).toEqual([]);
  });

  it('honours lambda, seedWindow and ppy', () => {
    const r = simpleReturns(closes);
    const custom = ewmaVolSeries(r, 0.9, 10, 365);
    expect(custom).toHaveLength(r.length - 10 + 1);
    expect(custom.at(-1)).toBeCloseTo(ewmaSigmaDaily(r, 0.9, 10) * Math.sqrt(365) * 100, 10);
  });
});
