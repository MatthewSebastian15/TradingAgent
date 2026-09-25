import { describe, expect, it } from 'vitest';

import {
  ewmaSigmaDaily,
  ewmaVol,
  kurtosis,
  median,
  percentileRank,
  periodsPerYearFromDates,
  quantile,
  rollingVol,
  skewness,
} from './stats';

describe('ewmaSigmaDaily seeding', () => {
  it('an extreme first return does not dominate 100 later calm days', () => {
    const calm = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.01 : -0.01));
    const sigma = ewmaSigmaDaily([0.5, ...calm]);
    expect(sigma).toBeLessThan(0.02);
  });

  it('series shorter than the seed window uses their mean square', () => {
    expect(ewmaSigmaDaily([0.02, -0.02, 0.02])).toBeCloseTo(0.02, 12);
  });
});

describe('periodsPerYearFromDates', () => {
  const calendarDays = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
  );
  const weekdaysOnly = calendarDays.filter(
    (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())
  );

  it('7-day markets -> 365, weekday markets -> 252, short input -> 252', () => {
    expect(periodsPerYearFromDates(calendarDays)).toBe(365);
    expect(periodsPerYearFromDates(weekdaysOnly)).toBe(252);
    expect(periodsPerYearFromDates(calendarDays.slice(0, 5))).toBe(252);
  });
});

describe('ppy scaling in stats', () => {
  const closes = [100, 102, 99, 104, 101, 107, 103, 108];
  it('rollingVol and ewmaVol scale with sqrt(ppy)', () => {
    const ratio = Math.sqrt(365 / 252);
    expect(rollingVol(closes, 3, 365)[0] / rollingVol(closes, 3)[0]).toBeCloseTo(ratio, 10);
    expect(ewmaVol(closes, 0.94, 365) / ewmaVol(closes)).toBeCloseTo(ratio, 10);
  });
});

describe('quantile / median', () => {
  it('interpolates linearly', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0)).toBe(1);
    expect(quantile([10], 0.9)).toBe(10);
    expect(quantile([], 0.5)).toBeNull();
  });

  it('clamps p outside [0, 1]', () => {
    expect(quantile([1, 2, 3], -1)).toBe(1);
    expect(quantile([1, 2, 3], 2)).toBe(3);
  });

  it('median ignores non-finite values, is null when empty, and does not mutate', () => {
    expect(median([3, 1, Number.NaN, 2])).toBe(2);
    expect(median([])).toBeNull();
    const input = [3, 1, 2];
    median(input);
    expect(input).toEqual([3, 1, 2]);
  });
});

describe('adjusted sample moments', () => {
  const xs = [1, 2, 3, 4, 10];
  const n = xs.length;
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const central = (k) => xs.reduce((a, x) => a + (x - m) ** k, 0) / n;

  it('matches pandas skew()/kurt() reference values', () => {
    // Independent reference: pandas Series([1, 2, 3, 4, 10]).skew() / .kurt().
    expect(skewness([1, 2, 3, 4, 10])).toBeCloseTo(1.6970562748, 9);
    expect(kurtosis([1, 2, 3, 4, 10])).toBeCloseTo(3.152, 9);
  });

  it('skewness applies the Fisher-Pearson small-sample adjustment', () => {
    const g1 = central(3) / central(2) ** 1.5;
    expect(skewness(xs)).toBeCloseTo((g1 * Math.sqrt(n * (n - 1))) / (n - 2), 12);
  });

  it('kurtosis applies the unbiased excess-kurtosis adjustment', () => {
    const g2 = central(4) / central(2) ** 2 - 3;
    expect(kurtosis(xs)).toBeCloseTo((((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3)), 12);
  });

  it('flat input is 0; too few points is null', () => {
    expect(skewness([2, 2, 2, 2])).toBe(0);
    expect(kurtosis([2, 2, 2, 2])).toBe(0);
    expect(skewness([1, 2])).toBeNull();
    expect(skewness([1, 2, 3])).not.toBeNull();
    expect(kurtosis([1, 2, 3])).toBeNull();
    expect(kurtosis([1, 2, 3, 5])).not.toBeNull();
  });
});

describe('percentileRank', () => {
  it('uses mid-rank for ties', () => {
    expect(percentileRank([10, 10, 10, 20], 10)).toBeCloseTo(37.5, 12);
    expect(percentileRank([1, 2, 3, 4, 5], 5)).toBeCloseTo(90, 12);
  });
});
