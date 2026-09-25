import { describe, expect, it } from 'vitest';

import { hurstLabel } from './format';
import { adfTest, anisLloydExpectedRS, hurstExponent, lgamma } from './persistence';
import { mulberry32, randNormal } from './stochastic';

const normals = (n, seed) => {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, () => randNormal(rng));
};

describe('lgamma / Anis-Lloyd', () => {
  it('matches known gamma values', () => {
    expect(lgamma(5)).toBeCloseTo(Math.log(24), 10);
    expect(lgamma(0.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI)), 10);
  });

  it('expected R/S grows with window length', () => {
    expect(anisLloydExpectedRS(64)).toBeGreaterThan(anisLloydExpectedRS(16));
  });
});

describe('hurstExponent', () => {
  it('i.i.d. noise sits near 0.5', () => {
    const h = hurstExponent(normals(2048, 11).map((z) => 0.01 * z));
    expect(Math.abs(h.hurst - 0.5)).toBeLessThan(0.1);
  });

  it('a highly persistent series scores well above 0.5', () => {
    let level = 0;
    const persistent = normals(2048, 12).map((z) => (level += 0.01 * z));
    const h = hurstExponent(persistent);
    expect(h.hurst).toBeGreaterThan(0.8);
    expect(h.significant).toBe(true);
  });

  it('needs at least 64 observations', () => {
    expect(hurstExponent(normals(50, 1))).toBeNull();
  });

  it('labels non-significant estimates honestly', () => {
    expect(hurstLabel(0.6, false)).toBe('No clear persistence');
    expect(hurstLabel(0.6, true)).toBe('Trending');
  });
});

describe('adfTest', () => {
  it('rejects a unit root for a stationary AR(1)', () => {
    let y = 0;
    const series = normals(500, 21).map((z) => (y = 0.5 * y + z));
    const r = adfTest(series);
    expect(r.stationaryAt5).toBe(true);
    expect(r.tStat).toBeLessThan(-2.86);
  });

  it('does not reject for a trending, non-stationary series', () => {
    const noise = normals(400, 22);
    const series = noise.map((z, i) => 0.01 * i + 0.001 * z);
    expect(adfTest(series).stationaryAt5).toBe(false);
  });

  it('short input -> null', () => {
    expect(adfTest([1, 2, 3])).toBeNull();
  });
});
