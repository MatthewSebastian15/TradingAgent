import { describe, expect, it } from 'vitest';

import { histogramBins, jarqueBera, normInv, qqPoints } from './distribution';

const normalGrid = Array.from({ length: 500 }, (_, i) => 0.01 * normInv((i + 0.5) / 500));

describe('normInv', () => {
  it('matches standard normal quantiles', () => {
    expect(normInv(0.5)).toBeCloseTo(0, 12);
    expect(normInv(0.975)).toBeCloseTo(1.959964, 5);
    expect(normInv(0.01)).toBeCloseTo(-2.326348, 5);
    expect(normInv(0)).toBeNull();
  });

  it('matches the 68-95-99.7 rule', () => {
    expect(normInv(0.8413)).toBeCloseTo(1, 3);
    expect(normInv(0.9772)).toBeCloseTo(2, 2);
  });

  it('has no jump at the tail-branch switch points', () => {
    const eps = 1e-9;
    const lowBefore = normInv(0.02425 - eps);
    const lowAt = normInv(0.02425);
    const lowAfter = normInv(0.02425 + eps);
    expect(Math.abs(lowAt - lowBefore)).toBeLessThan(1e-6);
    expect(Math.abs(lowAfter - lowAt)).toBeLessThan(1e-6);

    const highBefore = normInv(1 - 0.02425 - eps);
    const highAt = normInv(1 - 0.02425);
    const highAfter = normInv(1 - 0.02425 + eps);
    expect(Math.abs(highAt - highBefore)).toBeLessThan(1e-6);
    expect(Math.abs(highAfter - highAt)).toBeLessThan(1e-6);
  });

  it('returns null outside the open interval (0, 1)', () => {
    expect(normInv(0)).toBeNull();
    expect(normInv(1)).toBeNull();
    expect(normInv(-0.1)).toBeNull();
    expect(normInv(1.1)).toBeNull();
    expect(normInv(NaN)).toBeNull();
  });
});

describe('qqPoints', () => {
  it('a normal sample lies near the 45-degree line', () => {
    const pts = qqPoints(normalGrid);
    expect(pts).toHaveLength(500);
    expect(Math.abs(pts[250].x - pts[250].y)).toBeLessThan(0.02);
    expect(pts[0].x).toBeLessThan(-2.5);
  });

  it('returns x in ascending order', () => {
    const pts = qqPoints(normalGrid);
    for (let i = 1; i < pts.length; i += 1) {
      expect(pts[i].x).toBeGreaterThanOrEqual(pts[i - 1].x);
    }
  });

  it('standardizes y (z-scored), not raw sample values', () => {
    const shifted = normalGrid.map((v) => v + 100);
    const pts = qqPoints(shifted);
    // if y were raw, values would sit near 100; standardized they stay near 0.
    expect(Math.abs(pts[250].y)).toBeLessThan(1);
  });

  it('a skewed non-normal sample visibly deviates from the 45-degree line', () => {
    const n = 100;
    const skewed = Array.from({ length: n }, (_, i) => -Math.log(1 - (i + 0.5) / n));
    const pts = qqPoints(skewed);
    expect(Math.abs(pts[n - 1].x - pts[n - 1].y)).toBeGreaterThan(0.5);
  });

  it('returns [] for arrays too short to standardize', () => {
    expect(qqPoints([])).toEqual([]);
    expect(qqPoints([5])).toEqual([]);
    expect(qqPoints([1, 2])).toEqual([]);
  });
});

describe('jarqueBera', () => {
  it('does not reject a normal-shaped sample', () => {
    expect(jarqueBera(normalGrid).pValue).toBeGreaterThan(0.5);
  });

  it('rejects fat tails', () => {
    const fat = [
      ...Array.from({ length: 490 }, (_, i) => (i % 2 ? 0.001 : -0.001)),
      ...Array.from({ length: 10 }, (_, i) => (i % 2 ? 0.1 : -0.1)),
    ];
    const jb = jarqueBera(fat);
    expect(jb.pValue).toBeLessThan(0.001);
    expect(jb.normalAt5).toBe(false);
  });

  it('the chi2(2) survival identity exp(-JB/2) matches the known 5.991 critical value at alpha=0.05', () => {
    expect(Math.exp(-5.991 / 2)).toBeCloseTo(0.05, 3);
  });

  it('returns null below 8 values', () => {
    expect(jarqueBera([1, 2, 3, 4, 5, 6, 7])).toBeNull();
  });

  it('returns a result at exactly 8 values', () => {
    expect(jarqueBera([1, 2, 3, 4, 5, 6, 7, 8])).not.toBeNull();
  });

  it('returns null for zero variance', () => {
    expect(jarqueBera([1, 1, 1, 1, 1, 1, 1, 1])).toBeNull();
  });
});

describe('histogramBins', () => {
  it('clips outliers and keeps every in-range value', () => {
    const values = [...normalGrid, 5];
    const { bins, clippedLow, clippedHigh } = histogramBins(values);
    const counted = bins.reduce((a, b) => a + b.count, 0);
    expect(clippedHigh).toBeGreaterThanOrEqual(1);
    expect(counted + clippedLow + clippedHigh).toBe(values.length);
    expect(bins.length).toBeGreaterThanOrEqual(10);
    expect(bins.length).toBeLessThanOrEqual(60);
  });

  it('handles an empty array without crashing', () => {
    expect(histogramBins([])).toEqual({ bins: [], clippedLow: 0, clippedHigh: 0 });
  });

  it('handles an all-identical array with no NaN/Infinity and no division by zero', () => {
    const { bins, clippedLow, clippedHigh } = histogramBins(Array(20).fill(3));
    const counted = bins.reduce((a, b) => a + b.count, 0);
    expect(counted + clippedLow + clippedHigh).toBe(20);
    for (const b of bins) {
      expect(Number.isFinite(b.binStart)).toBe(true);
      expect(Number.isFinite(b.binEnd)).toBe(true);
      expect(Number.isFinite(b.count)).toBe(true);
    }
  });
});
