import { describe, expect, it } from 'vitest';

import {
  ledoitWolf,
  maxSharpeLongOnly,
  minVarianceLongOnly,
  projectCappedSimplex,
  resampleWeekly,
  riskParity,
} from './optimizer';
import { mulberry32, randNormal } from './stochastic';

const diag = [
  [1, 0],
  [0, 4],
];

describe('projectCappedSimplex', () => {
  it('projects onto the simplex with a cap', () => {
    projectCappedSimplex([0.5, 0.5, 0.5]).forEach((w) => expect(w).toBeCloseTo(1 / 3, 8));
    const capped = projectCappedSimplex([2, 0, 0], 0.6);
    expect(capped[0]).toBeCloseTo(0.6, 8);
    expect(capped[1]).toBeCloseTo(0.2, 8);
    expect(capped.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
  });
});

describe('long-only optimizers', () => {
  it('min-variance weights are inverse-variance for uncorrelated assets', () => {
    const w = minVarianceLongOnly(diag);
    expect(w[0]).toBeCloseTo(0.8, 3);
    expect(w[1]).toBeCloseTo(0.2, 3);
  });

  it('respects the weight cap', () => {
    const w = minVarianceLongOnly(diag, 0.6);
    expect(w[0]).toBeCloseTo(0.6, 3);
  });

  it('max-Sharpe long-only matches the unconstrained tangency when it is already long-only', () => {
    const { weights, negativeExcess } = maxSharpeLongOnly(diag, [1, 1], 0);
    expect(weights[0]).toBeCloseTo(0.8, 1);
    expect(negativeExcess).toBe(false);
  });

  it('flags a basket with no positive excess return', () => {
    expect(maxSharpeLongOnly(diag, [-1, -2], 0).negativeExcess).toBe(true);
  });
});

describe('riskParity', () => {
  it('equalizes risk contributions', () => {
    const w = riskParity(diag);
    expect(w[0]).toBeCloseTo(2 / 3, 6);
    const eq = riskParity([
      [1, 0.5],
      [0.5, 1],
    ]);
    expect(eq[0]).toBeCloseTo(0.5, 6);
  });
});

describe('ledoitWolf', () => {
  // Heterogeneous per-asset scale (not iid-identical) so the true covariance has real
  // distance from the mu*I target — with identical-variance assets the population
  // shrinkage is T-invariant and the scarce-vs-rich comparison below is a coin flip.
  const sample = (T, p, seed) => {
    const rng = mulberry32(seed);
    return Array.from({ length: p }, (_, i) =>
      Array.from({ length: T }, () => 0.01 * (1 + i) * randNormal(rng))
    );
  };

  it('returns a convex shrinkage that grows when data is scarce', () => {
    const scarce = ledoitWolf(sample(6, 4, 1));
    const rich = ledoitWolf(sample(600, 4, 1));
    expect(scarce.shrinkage).toBeGreaterThanOrEqual(0);
    expect(scarce.shrinkage).toBeLessThanOrEqual(1);
    expect(scarce.shrinkage).toBeGreaterThan(rich.shrinkage);
    expect(scarce.matrix[0][1]).toBeCloseTo(scarce.matrix[1][0], 15);
  });
});

describe('resampleWeekly', () => {
  it('keeps the last close of each week', () => {
    const dates = ['2026-09-07', '2026-09-09', '2026-09-11', '2026-09-14', '2026-09-15'];
    const out = resampleWeekly(dates, { A: [1, 2, 3, 4, 5] });
    expect(out.dates).toEqual(['2026-09-11', '2026-09-15']);
    expect(out.closes.A).toEqual([3, 5]);
  });
});
