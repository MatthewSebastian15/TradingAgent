import { describe, expect, it } from 'vitest';

import { calmar, rollingSharpe, suggestedPosition, zipRollingToDates } from './series';

describe('zipRollingToDates', () => {
  it('maps rolling index i to dates[window + i] and drops non-finite values', () => {
    const dates = ['d0', 'd1', 'd2', 'd3', 'd4'];
    expect(zipRollingToDates([1, null, 3], dates, 2)).toEqual([
      { date: 'd2', value: 1 },
      { date: 'd4', value: 3 },
    ]);
  });

  it('stops when dates run out', () => {
    expect(zipRollingToDates([1, 2, 3], ['a', 'b', 'c'], 2)).toEqual([{ date: 'c', value: 1 }]);
  });
});

describe('suggestedPosition', () => {
  it('caps half-Kelly by the vol-target weight', () => {
    expect(suggestedPosition(2.4, 0.3)).toBeCloseTo(0.3, 12);
  });

  it('uses half-Kelly when it is below the cap', () => {
    expect(suggestedPosition(0.4, 1.2)).toBeCloseTo(0.2, 12);
  });

  it('negative edge -> 0; missing kelly -> null; missing cap -> half-Kelly', () => {
    expect(suggestedPosition(-1, 0.5)).toBe(0);
    expect(suggestedPosition(null, 0.5)).toBeNull();
    expect(suggestedPosition(0.6, null)).toBeCloseTo(0.3, 12);
  });
});

describe('ppy in series helpers', () => {
  it('calmar uses ppy for the CAGR horizon', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i - (i > 250 ? 30 : 0));
    const years = 299 / 365;
    const cagr = (closes.at(-1) / closes[0]) ** (1 / years) - 1;
    const dd = Math.abs(
      Math.min(...closes.map((c, i) => c / Math.max(...closes.slice(0, i + 1)) - 1))
    );
    expect(calmar(closes, 365)).toBeCloseTo(cagr / dd, 10);
  });

  it('rollingSharpe passes ppy through', () => {
    const r = Array.from({ length: 10 }, (_, i) => (i % 3 ? 0.01 : -0.006));
    expect(rollingSharpe(r, 5, 0, 365)[0] / rollingSharpe(r, 5, 0)[0]).toBeCloseTo(
      Math.sqrt(365 / 252),
      10
    );
  });
});
