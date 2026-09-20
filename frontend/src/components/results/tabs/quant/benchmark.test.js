import { describe, expect, it } from 'vitest';

import { alpha } from './benchmark';

describe('alpha annualization', () => {
  it('scales linearly with ppy', () => {
    const market = [0.01, -0.02, 0.015, -0.005, 0.012];
    const stock = market.map((x, i) => 1.3 * x + (i % 2 ? 0.001 : 0.002));
    expect(alpha(stock, market, 0, 365) / alpha(stock, market, 0)).toBeCloseTo(365 / 252, 10);
  });
});
