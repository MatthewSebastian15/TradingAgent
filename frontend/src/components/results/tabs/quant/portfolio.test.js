import { describe, expect, it } from 'vitest';

import { efficientFrontier, gmvWeights, tangencyWeights } from './portfolio';

const cov = [
  [0.0004, 0],
  [0, 0.0001],
];

describe('tangencyWeights sign guard', () => {
  it('positive excess returns -> normalized max-Sharpe weights', () => {
    const w = tangencyWeights(cov, [0.001, 0.0005], 0);
    expect(w[0]).toBeCloseTo(1 / 3, 10);
    expect(w[1]).toBeCloseTo(2 / 3, 10);
  });

  it('negative normalizer -> null instead of the flipped minimum-Sharpe portfolio', () => {
    expect(tangencyWeights(cov, [-0.001, -0.0005], 0)).toBeNull();
    expect(efficientFrontier(cov, [-0.001, -0.0005], 0)).toEqual([]);
  });

  it('GMV is unaffected by expected returns', () => {
    const w = gmvWeights(cov);
    expect(w[0]).toBeCloseTo(0.2, 10);
    expect(w[1]).toBeCloseTo(0.8, 10);
  });
});

describe('efficientFrontier ppy', () => {
  it('annualizes vol with sqrt(ppy) and return with ppy', () => {
    const mu = [0.001, 0.0005];
    const a = efficientFrontier(cov, mu, 0, 25);
    const b = efficientFrontier(cov, mu, 0, 25, 365);
    expect(b[3].vol / a[3].vol).toBeCloseTo(Math.sqrt(365 / 252), 10);
    expect(b[3].ret / a[3].ret).toBeCloseTo(365 / 252, 10);
  });
});
