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
});
