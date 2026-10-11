import { describe, expect, it } from 'vitest';

import {
  changeFraction,
  positionStats,
  summarizeByCurrency,
  summarizeHoldings,
} from './holdingsPerf';

describe('holdingsPerf', () => {
  it('parses day-change strings and numbers', () => {
    expect(changeFraction('+2.95%')).toBeCloseTo(0.0295);
    expect(changeFraction('-1.5%')).toBeCloseTo(-0.015);
    expect(changeFraction(3)).toBeCloseTo(0.03);
    expect(changeFraction('N/A')).toBeNull();
  });

  it('computes value, P/L and day P/L', () => {
    const s = positionStats({ shares: 10, cost_basis: 100 }, 110, '+10%');
    expect(s.cost).toBe(1000);
    expect(s.value).toBe(1100);
    expect(s.pl).toBe(100);
    expect(s.plPct).toBeCloseTo(0.1);
    // value 1100 came from +10% day move => prior value 1000, day P/L = 100.
    expect(s.dayPL).toBeCloseTo(100);
  });

  it('leaves value null when price is missing but still counts cost', () => {
    const s = positionStats({ shares: 5, cost_basis: 20 }, undefined, null);
    expect(s.cost).toBe(100);
    expect(s.value).toBeNull();
    expect(s.pl).toBeNull();
  });

  it('summarizes totals and best/worst', () => {
    const rows = [
      { holding: { ticker: 'A', shares: 10, cost_basis: 100 }, price: 110, chg: '+10%' },
      { holding: { ticker: 'B', shares: 1, cost_basis: 100 }, price: 50, chg: '0%' },
    ];
    const sum = summarizeHoldings(rows);
    expect(sum.count).toBe(2);
    expect(sum.totalCost).toBe(1100);
    expect(sum.totalValue).toBe(1150);
    expect(sum.totalPL).toBe(50);
    expect(sum.best.ticker).toBe('A');
    expect(sum.worst.ticker).toBe('B');
  });
});

describe('holdingsPerf null prices', () => {
  it('does not value a lot at zero when the quote price is null', () => {
    const s = positionStats({ shares: 10, cost_basis: 100 }, null, 'N/A');
    expect(s.value).toBeNull();
    expect(s.pl).toBeNull();
    expect(s.plPct).toBeNull();
  });
});

describe('holdingsPerf priced-lot totals', () => {
  it('computes P/L over priced lots only (an unpriced lot does not become a loss)', () => {
    const rows = [
      { holding: { ticker: 'A', shares: 10, cost_basis: 100 }, price: 110, chg: '0%' },
      { holding: { ticker: 'B', shares: 10, cost_basis: 100 }, price: null, chg: 'N/A' },
    ];
    const sum = summarizeHoldings(rows);

    expect(sum.totalCost).toBe(2000); // Cost Basis still shows every lot
    expect(sum.pricedCost).toBe(1000);
    expect(sum.totalValue).toBe(1100);
    expect(sum.totalPL).toBe(100); // not -900
    expect(sum.totalPLPct).toBeCloseTo(0.1);
    expect(sum.unpricedCount).toBe(1);
    expect(sum.valuedCount).toBe(1);
  });

  it('is null (not a loss) when nothing is priced', () => {
    const sum = summarizeHoldings([
      { holding: { ticker: 'B', shares: 10, cost_basis: 100 }, price: undefined, chg: undefined },
    ]);
    expect(sum.totalValue).toBeNull();
    expect(sum.totalPL).toBeNull();
    expect(sum.unpricedCount).toBe(1);
  });

  it('counts positions by distinct ticker, not by lot', () => {
    const rows = [
      { holding: { ticker: 'AAPL', shares: 1, cost_basis: 1 }, price: 2, chg: '0%' },
      { holding: { ticker: 'AAPL', shares: 1, cost_basis: 1 }, price: 2, chg: '0%' },
      { holding: { ticker: 'MSFT', shares: 1, cost_basis: 1 }, price: 2, chg: '0%' },
    ];
    const sum = summarizeHoldings(rows);
    expect(sum.count).toBe(3);
    expect(sum.tickerCount).toBe(2);
  });
});

describe('summarizeByCurrency', () => {
  it('never mixes currencies and sorts the largest value first', () => {
    const rows = [
      {
        holding: { ticker: 'AAPL', shares: 1, cost_basis: 100 },
        price: 120,
        chg: '0%',
        currency: 'USD',
      },
      {
        holding: { ticker: 'BBCA.JK', shares: 100, cost_basis: 9000 },
        price: 9500,
        chg: '0%',
        currency: 'IDR',
      },
    ];
    const [first, second] = summarizeByCurrency(rows);

    expect(first.currency).toBe('IDR');
    expect(first.totalValue).toBe(950000);
    expect(second.currency).toBe('USD');
    expect(second.totalValue).toBe(120);
  });

  it('defaults a missing currency to USD and returns [] for no rows', () => {
    expect(summarizeByCurrency([])).toEqual([]);
    const [only] = summarizeByCurrency([
      { holding: { ticker: 'X', shares: 1, cost_basis: 1 }, price: 2, chg: '0%' },
    ]);
    expect(only.currency).toBe('USD');
  });
});
