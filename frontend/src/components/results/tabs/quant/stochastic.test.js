import { describe, expect, it } from 'vitest';

import {
  blendSigma,
  bootstrapMC,
  futureTradingDates,
  horizonSigma,
  monteCarloGBM,
  runMonteCarlo,
  simulationDrift,
} from './stochastic';

describe('simulationDrift', () => {
  it('historical mode converts mean log return to arithmetic drift', () => {
    expect(
      simulationDrift({ mode: 'historical', logReturns: [0.001, 0.003], sigma: 0.02 })
    ).toBeCloseTo(0.002 + 0.5 * 0.02 * 0.02, 12);
  });

  it('risk-neutral mode returns the daily risk-free rate', () => {
    expect(
      simulationDrift({ mode: 'riskneutral', logReturns: [0.01], sigma: 0.02, rfDaily: 0.0002 })
    ).toBe(0.0002);
  });

  it('empty history -> 0 drift', () => {
    expect(simulationDrift({ mode: 'historical', logReturns: [], sigma: 0.02 })).toBe(0);
  });

  it('keeps the simulated median at exp(mean log return × days)', () => {
    const g = 0.0004;
    const sigma = 0.03;
    const days = 252;
    const mu = simulationDrift({ mode: 'historical', logReturns: [g, g, g, g], sigma });
    const { percentiles } = monteCarloGBM(100, mu, sigma, days, 3000, 11);
    expect(percentiles.p50 / (100 * Math.exp(g * days))).toBeCloseTo(1, 1);
  });

  it('documents the old bug: passing mean log return directly biases the median down', () => {
    const g = 0.0004;
    const { percentiles } = monteCarloGBM(100, g, 0.03, 252, 3000, 11);
    expect(percentiles.p50 / (100 * Math.exp(g * 252))).toBeLessThan(0.95);
  });
});

describe('blendSigma / horizonSigma', () => {
  it('one day uses EWMA; long horizons converge to the long-run sigma', () => {
    expect(blendSigma(0.03, 0.01, 1)).toBeCloseTo(0.03, 12);
    expect(Math.abs(blendSigma(0.03, 0.01, 5000) - 0.01)).toBeLessThan(0.001);
    const mid = blendSigma(0.03, 0.01, 21);
    expect(mid).toBeLessThan(0.03);
    expect(mid).toBeGreaterThan(0.01);
  });

  it('prefers a GARCH fit when present', () => {
    const fit = { persistence: 0.9, longRunVariance: 1e-4, nextVariance: 1e-4 };
    expect(horizonSigma({ garchFit: fit, ewmaSigma: 0.05, longRunSigma: 0.02, days: 21 })).toEqual({
      sigma: 0.01,
      source: 'garch',
    });
    expect(
      horizonSigma({ garchFit: null, ewmaSigma: 0.02, longRunSigma: 0.02, days: 21 }).source
    ).toBe('blend');
  });
});

describe('path summaries', () => {
  it('deterministic rising paths: touch probabilities, no drawdown, ordered percentiles', () => {
    const sim = monteCarloGBM(100, 0.001, 0, 50, 100, 1, { target: 104, stop: 99 });
    expect(sim.probTarget).toBe(1);
    expect(sim.probStop).toBe(0);
    expect(sim.probBelowSpot).toBe(0);
    expect(sim.maxDrawdownMedian).toBe(0);
    expect(sim.expectedReturnPct).toBeCloseTo((Math.exp(0.05) - 1) * 100, 8);
  });

  it('noisy paths keep p5 <= p25 <= p50 <= p75 <= p95 and expose band p5/p95', () => {
    const {
      percentiles: p,
      band,
      maxDrawdownWorst10,
      maxDrawdownMedian,
    } = monteCarloGBM(100, 0.0003, 0.02, 60, 800, 3);
    expect(p.p5).toBeLessThanOrEqual(p.p25);
    expect(p.p25).toBeLessThanOrEqual(p.p50);
    expect(p.p50).toBeLessThanOrEqual(p.p75);
    expect(p.p75).toBeLessThanOrEqual(p.p95);
    expect(band[60].p5).toBeLessThan(band[60].p95);
    expect(maxDrawdownWorst10).toBeLessThanOrEqual(maxDrawdownMedian);
    expect(monteCarloGBM(100, 0, 0.02, 10, 50, 3).probTarget).toBeNull();
  });

  it('demeaned bootstrap removes the historical drift; drift re-adds a chosen one', () => {
    const returns = [0.01, 0.02, 0.03];
    const raw = bootstrapMC(100, returns, 50, 2000, 9, 1);
    const flat = bootstrapMC(100, returns, 50, 2000, 9, 1, { demean: true });
    const withDrift = bootstrapMC(100, returns, 50, 2000, 9, 1, { demean: true, drift: 0.001 });
    expect(raw.expectedReturnPct).toBeGreaterThan(100);
    expect(Math.abs(flat.expectedReturnPct)).toBeLessThan(2);
    expect(withDrift.expectedReturnPct).toBeGreaterThan(4);
    expect(withDrift.expectedReturnPct).toBeLessThan(6.5);
  });
});

describe('futureTradingDates / runMonteCarlo', () => {
  it('skips weekends for 252-period markets only', () => {
    expect(futureTradingDates('2026-09-11', 3)).toEqual(['2026-09-14', '2026-09-15', '2026-09-16']);
    expect(futureTradingDates('2026-09-11', 3, 365)).toEqual([
      '2026-09-12',
      '2026-09-13',
      '2026-09-14',
    ]);
    expect(futureTradingDates('bad', 3)).toEqual([]);
  });

  it('dispatches to the requested engine', () => {
    const gbm = runMonteCarlo({ method: 'gbm', args: [100, 0, 0, 5, 10, 1] });
    expect(gbm.percentiles.p50).toBeCloseTo(100, 10);
    const boot = runMonteCarlo({ method: 'bootstrap', args: [100, [0, 0], 5, 10, 1] });
    expect(boot.percentiles.p50).toBeCloseTo(100, 10);
  });
});
