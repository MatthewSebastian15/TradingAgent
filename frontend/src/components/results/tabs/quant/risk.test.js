import { describe, expect, it } from 'vitest';

import { downsideDeviation, sharpe, sortino } from './risk';

const r = [0.01, -0.005, 0.02, 0.01, -0.012, 0.015, -0.003];

describe('ppy scaling in risk ratios', () => {
  it('sharpe, sortino and downside deviation scale with sqrt(ppy)', () => {
    const ratio = Math.sqrt(365 / 252);
    expect(sharpe(r, 0, 365) / sharpe(r, 0)).toBeCloseTo(ratio, 10);
    expect(sortino(r, 0, 365) / sortino(r, 0)).toBeCloseTo(ratio, 10);
    expect(downsideDeviation(r, 0, 365) / downsideDeviation(r, 0)).toBeCloseTo(ratio, 10);
  });
});
