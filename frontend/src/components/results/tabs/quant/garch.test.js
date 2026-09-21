import { describe, expect, it } from 'vitest';

import { fitGarch, garchForecast, garchTermStructure } from './garch';
import { mulberry32, randNormal } from './stochastic';

function simulateGarch(n, { omega, alpha, beta }, seed) {
  const rng = mulberry32(seed);
  let h = omega / (1 - alpha - beta);
  const out = [];
  for (let t = 0; t < n; t += 1) {
    const e = Math.sqrt(h) * randNormal(rng);
    out.push(e);
    h = omega + alpha * e * e + beta * h;
  }
  return out;
}

describe('fitGarch', () => {
  const truth = { omega: 5e-6, alpha: 0.08, beta: 0.87 };
  const fit = fitGarch(simulateGarch(4000, truth, 2026));

  it('recovers persistence and alpha from a simulated GARCH(1,1)', () => {
    expect(Math.abs(fit.persistence - 0.95)).toBeLessThan(0.04);
    expect(Math.abs(fit.alpha - 0.08)).toBeLessThan(0.05);
    expect(fit.observations).toBe(4000);
  });

  it('keeps the best grid point off the grid boundary and below the stationarity cap', () => {
    expect(fit.alpha).toBeGreaterThan(0.01);
    expect(fit.alpha).toBeLessThan(0.2);
    expect(fit.beta).toBeGreaterThan(0.7);
    expect(fit.beta).toBeLessThan(0.98);
    expect(fit.persistence).toBeLessThan(0.999);
  });

  it('uses variance targeting: omega = V(1 - alpha - beta)', () => {
    expect(fit.omega).toBeCloseTo(fit.longRunVariance * (1 - fit.persistence), 15);
  });

  it('needs at least 100 returns', () => {
    expect(fitGarch(Array.from({ length: 99 }, (_, i) => (i % 2 ? 0.01 : -0.01)))).toBeNull();
  });

  it('returns null for zero-variance input', () => {
    expect(fitGarch(new Array(300).fill(0.001))).toBeNull();
  });

  it('returns null for null / non-array input', () => {
    expect(fitGarch(null)).toBeNull();
    expect(fitGarch(undefined)).toBeNull();
  });

  it('drops non-finite returns before fitting and never yields NaN', () => {
    const clean = simulateGarch(300, truth, 7);
    const dirty = [...clean.slice(0, 100), NaN, Infinity, null, ...clean.slice(100)];
    const f = fitGarch(dirty);
    expect(f.observations).toBe(300);
    expect(f).toEqual(fitGarch(clean));
    expect(Object.values(f).every(Number.isFinite)).toBe(true);
  });

  it('returns null when filtering leaves fewer than 100 returns', () => {
    const r = simulateGarch(120, truth, 7);
    expect(
      fitGarch([...r.slice(0, 50), ...new Array(30).fill(NaN), ...r.slice(50, 99)])
    ).toBeNull();
  });

  it('fits 2,500 returns quickly', () => {
    const r = simulateGarch(2500, truth, 11);
    const t0 = performance.now();
    fitGarch(r);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('forecasts converge to the long-run variance', () => {
    expect(garchForecast(fit, 2000).path.at(-1)).toBeCloseTo(fit.longRunVariance, 12);
  });

  it('nextVariance is h_{n+1}: reacts to a large final shock', () => {
    const base = simulateGarch(300, truth, 5);
    const calm = fitGarch([...base, 0]);
    const shocked = fitGarch([...base, 0.2]);
    expect(shocked.nextVariance).toBeGreaterThan(calm.nextVariance * 2);
  });
});

describe('garchForecast', () => {
  it('term structure skips horizons below one day instead of throwing', () => {
    const fit = { persistence: 0.95, longRunVariance: 1e-4, nextVariance: 4e-4 };
    expect(garchTermStructure(fit, [0, 5, 0.5]).map((r) => r.days)).toEqual([5]);
  });

  it('is flat when the next variance equals the long-run variance', () => {
    const fit = { persistence: 0.9, longRunVariance: 1e-4, nextVariance: 1e-4 };
    const f = garchForecast(fit, 21);
    expect(f.dailySigma).toBeCloseTo(0.01, 12);
    expect(f.annualVol).toBeCloseTo(0.01 * Math.sqrt(252) * 100, 10);
  });

  it('scales annual vol by the periods-per-year argument', () => {
    const fit = { persistence: 0.9, longRunVariance: 1e-4, nextVariance: 1e-4 };
    const f = garchForecast(fit, 21, 365);
    expect(f.annualVol).toBeCloseTo(0.01 * Math.sqrt(365) * 100, 10);
  });

  it('follows h_k = V_L + p^(k-1)(h_1 - V_L) and averages the path', () => {
    const fit = { persistence: 0.5, longRunVariance: 1e-4, nextVariance: 3e-4 };
    const f = garchForecast(fit, 3);
    expect(f.path[0]).toBeCloseTo(3e-4, 15);
    expect(f.path[1]).toBeCloseTo(2e-4, 15);
    expect(f.path[2]).toBeCloseTo(1.5e-4, 15);
    expect(f.dailySigma).toBeCloseTo(Math.sqrt((3e-4 + 2e-4 + 1.5e-4) / 3), 15);
  });

  it('returns null for a missing fit or days < 1', () => {
    const fit = { persistence: 0.9, longRunVariance: 1e-4, nextVariance: 1e-4 };
    expect(garchForecast(null, 21)).toBeNull();
    expect(garchForecast(fit, 0)).toBeNull();
    expect(garchForecast(fit, -5)).toBeNull();
    expect(garchForecast(fit, NaN)).toBeNull();
  });
});

describe('garchTermStructure', () => {
  it('returns one row per horizon', () => {
    const fit = { persistence: 0.95, longRunVariance: 1e-4, nextVariance: 4e-4 };
    const rows = garchTermStructure(fit, [5, 21]);
    expect(rows.map((r) => r.days)).toEqual([5, 21]);
    expect(rows[0].annualVol).toBeGreaterThan(rows[1].annualVol);
  });

  it('returns [] for a missing fit and uses default horizons', () => {
    expect(garchTermStructure(null)).toEqual([]);
    const fit = { persistence: 0.95, longRunVariance: 1e-4, nextVariance: 4e-4 };
    expect(garchTermStructure(fit).map((r) => r.days)).toEqual([5, 21, 63, 126, 252]);
  });

  it('decreases with horizon when h_1 > V_L and increases when h_1 < V_L', () => {
    const down = garchTermStructure({
      persistence: 0.95,
      longRunVariance: 1e-4,
      nextVariance: 4e-4,
    });
    const up = garchTermStructure({ persistence: 0.95, longRunVariance: 4e-4, nextVariance: 1e-4 });
    for (let i = 1; i < down.length; i += 1) {
      expect(down[i].annualVol).toBeLessThan(down[i - 1].annualVol);
      expect(up[i].annualVol).toBeGreaterThan(up[i - 1].annualVol);
    }
  });

  it('respects ppy', () => {
    const fit = { persistence: 0.9, longRunVariance: 1e-4, nextVariance: 1e-4 };
    const [row] = garchTermStructure(fit, [5], 365);
    expect(row.annualVol).toBeCloseTo(0.01 * Math.sqrt(365) * 100, 10);
  });
});
