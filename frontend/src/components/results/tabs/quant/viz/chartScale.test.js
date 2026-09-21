import { describe, expect, it } from 'vitest';

import {
  dateTicks,
  extent,
  layoutLabels,
  linearScale,
  logScale,
  logTicks,
  nearestIndex,
  niceTicks,
  paddedDomain,
  timeToIso,
  toTime,
} from './chartScale';

describe('chartScale', () => {
  it('linearScale maps and inverts', () => {
    const s = linearScale([0, 10], [100, 200]);
    expect(s(5)).toBe(150);
    expect(s.invert(175)).toBe(7.5);
  });

  it('logScale maps decades evenly', () => {
    const s = logScale([1, 100], [0, 200]);
    expect(s(10)).toBeCloseTo(100, 10);
    expect(s.invert(100)).toBeCloseTo(10, 10);
  });

  it('extent ignores non-finite values', () => {
    expect(extent([3, Number.NaN, -1, null, 7])).toEqual([-1, 7]);
    expect(extent([])).toBeNull();
  });

  it('paddedDomain pads and can include zero', () => {
    expect(paddedDomain([10, 20])).toEqual([9.4, 20.6]);
    expect(paddedDomain([5, 10], { includeZero: true, padRatio: 0 })).toEqual([0, 10]);
  });

  it('niceTicks are ascending and cover the range', () => {
    const ticks = niceTicks(0.3, 9.7, 5);
    expect(ticks[0]).toBeLessThanOrEqual(0.3);
    expect(ticks.at(-1)).toBeGreaterThanOrEqual(9.7);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });

  it('logTicks uses 1-2-5 steps', () => {
    expect(logTicks(1, 100)).toEqual([1, 2, 5, 10, 20, 50, 100]);
  });

  it('logTicks falls back to denser ticks on narrow ranges', () => {
    expect(logTicks(3, 4)).toEqual([3, 3.5, 4]);
    expect(logTicks(1, 1.5)).toEqual([1, 1.2, 1.4]);
    expect(logTicks(5, 5.5)).toEqual([5, 5.2, 5.4]);
    const price = logTicks(120, 180);
    expect(price.length).toBeGreaterThanOrEqual(3);
    expect(price.every((v) => v > 0)).toBe(true);
    expect(logTicks(3, 9)).toEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it('logTicks returns [] for non-positive or inverted ranges', () => {
    expect(logTicks(0, 10)).toEqual([]);
    expect(logTicks(-5, 10)).toEqual([]);
    expect(logTicks(10, 5)).toEqual([]);
  });

  it('niceTicks has no float accumulation noise', () => {
    expect(niceTicks(0, 0.5, 6)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5]);
    expect(niceTicks(0, 1, 11)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]);
  });

  it('paddedDomain guards null and scales the flat-series pad', () => {
    expect(paddedDomain(null)).toBeNull();
    expect(paddedDomain([0.01, 0.01])).toEqual([0.0098, 0.0102]);
    expect(paddedDomain([0, 0])).toEqual([-1, 1]);
  });

  it('nearestIndex returns -1 for a non-finite x', () => {
    expect(nearestIndex([0, 10], Number.NaN)).toBe(-1);
    expect(nearestIndex([0, 10], Infinity)).toBe(-1);
  });

  it('date helpers round-trip and label by span', () => {
    const t0 = toTime('2026-01-02');
    expect(timeToIso(t0)).toBe('2026-01-02');
    expect(toTime('bad')).toBeNull();
    const short = dateTicks([t0, toTime('2026-03-02')], 3);
    expect(short).toHaveLength(3);
    expect(short[0].label).toBe('01-02');
    const long = dateTicks([t0, toTime('2027-06-30')], 2);
    expect(long[0].label).toBe('Jan 26');
  });

  it('nearestIndex finds the closest x', () => {
    expect(nearestIndex([0, 10, 20, 30], 14)).toBe(1);
    expect(nearestIndex([0, 10, 20, 30], 16)).toBe(2);
    expect(nearestIndex([], 5)).toBe(-1);
  });

  it('layoutLabels pushes colliding labels down', () => {
    const out = layoutLabels([
      { x: 100, y: 50 },
      { x: 110, y: 52 },
      { x: 400, y: 50 },
    ]);
    expect(out[0].labelY).toBe(50);
    expect(out[1].labelY).toBe(64);
    expect(out[2].labelY).toBe(50);
  });

  it('layoutLabels with maxY shifts an overflowing stack upward keeping order and gap', () => {
    const items = Array.from({ length: 5 }, () => ({ x: 100, y: 190 }));
    const out = layoutLabels(items, { maxY: 200 });
    const ys = out.map((o) => o.labelY);
    expect(Math.max(...ys)).toBeLessThanOrEqual(200);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12);
    // no overflow -> identical to the unbounded layout
    const near = [
      { x: 100, y: 50 },
      { x: 110, y: 52 },
    ];
    expect(layoutLabels(near, { maxY: 500 })).toEqual(layoutLabels(near));
  });

  it('layoutLabels with minY keeps a crowded stack inside [minY, maxY]', () => {
    // 12 labels at 12px gap need 132px but only 60px are available.
    const items = Array.from({ length: 12 }, () => ({ x: 100, y: 90 }));
    const out = layoutLabels(items, { minY: 20, maxY: 80 });
    for (const o of out) {
      expect(o.labelY).toBeGreaterThanOrEqual(20);
      expect(o.labelY).toBeLessThanOrEqual(80);
    }
    // a stack that fits keeps the minimum gap and stays ordered
    const fit = layoutLabels(
      Array.from({ length: 4 }, () => ({ x: 100, y: 90 })),
      { minY: 20, maxY: 80 }
    ).map((o) => o.labelY);
    expect(Math.min(...fit)).toBeGreaterThanOrEqual(20);
    for (let i = 1; i < fit.length; i += 1) expect(fit[i] - fit[i - 1]).toBeGreaterThanOrEqual(12);
  });

  it('layoutLabels keeps finite labels stable when one y is NaN', () => {
    const items = [
      { x: 100, y: 50 },
      { x: 100, y: 56 },
      { x: 100, y: 62 },
      { x: 100, y: Number.NaN },
    ];
    // NaN is never an overflow, so the plain top-down layout is kept; the reverse
    // (overflow) pass would place these three differently.
    expect(
      layoutLabels(items, { maxY: 200 })
        .map((o) => o.labelY)
        .slice(0, 3)
    ).toEqual(layoutLabels(items.slice(0, 3)).map((o) => o.labelY));
  });

  it('logScale falls back to linear when a domain bound is not positive', () => {
    const s = logScale([0, 100], [0, 200]);
    expect(s(50)).toBe(100);
    expect(s.invert(100)).toBe(50);
    expect(logScale([-5, 5], [0, 10])(0)).toBe(5);
  });

  it('date helpers tolerate invalid input', () => {
    expect(dateTicks([Number.NaN, 5])).toEqual([]);
    expect(dateTicks(null)).toEqual([]);
    expect(dateTicks([1, Infinity])).toEqual([]);
    expect(timeToIso(null)).toBe('');
    expect(timeToIso(Number.NaN)).toBe('');
    expect(timeToIso(undefined)).toBe('');
    expect(timeToIso(1e20)).toBe('');
  });

  it('dateTicks switches to month labels just above 300 days', () => {
    const t0 = toTime('2026-01-01');
    expect(dateTicks([t0, t0 + 300 * 86_400_000], 2)[0].label).toBe('01-01');
    expect(dateTicks([t0, t0 + 301 * 86_400_000], 2)[0].label).toBe('Jan 26');
  });
});
