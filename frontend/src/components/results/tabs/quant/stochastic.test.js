import { describe, expect, it } from 'vitest';

import { monteCarloGBM, simulationDrift } from './stochastic';

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
