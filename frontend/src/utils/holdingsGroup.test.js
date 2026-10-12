import { describe, expect, it } from 'vitest';

import { groupByTicker } from './holdingsGroup';

const row = (id, ticker, shares, cost, price = 120) => ({
  holding: { id, ticker, shares, cost_basis: cost },
  price,
  chg: '+1.00%',
  trend: [1, 2],
  currency: 'USD',
});

describe('groupByTicker', () => {
  it('merges lots of one ticker with a weighted average cost', () => {
    const [group] = groupByTicker([row('a', 'AAPL', 10, 100), row('b', 'AAPL', 5, 130)]);

    expect(group.lotCount).toBe(2);
    expect(group.holding.shares).toBe(15);
    expect(group.holding.cost_basis).toBeCloseTo(110); // (1000 + 650) / 15
    expect(group.stats.cost).toBeCloseTo(1650);
    expect(group.stats.value).toBe(1800); // 15 * 120
    expect(group.stats.pl).toBeCloseTo(150);
    expect(group.lots).toHaveLength(2);
  });

  it('keeps tickers separate and preserves first-appearance order', () => {
    const groups = groupByTicker([
      row('a', 'MSFT', 1, 1),
      row('b', 'AAPL', 1, 1),
      row('c', 'MSFT', 1, 1),
    ]);
    expect(groups.map((group) => group.ticker)).toEqual(['MSFT', 'AAPL']);
    expect(groups[0].lotCount).toBe(2);
  });

  it('keeps a missing price as unpriced (no zero valuation)', () => {
    const [group] = groupByTicker([row('a', 'AAPL', 10, 100, null)]);
    expect(group.stats.value).toBeNull();
    expect(group.stats.pl).toBeNull();
  });

  it('returns [] for no rows', () => {
    expect(groupByTicker([])).toEqual([]);
  });
});
