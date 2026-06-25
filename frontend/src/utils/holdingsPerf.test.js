import { describe, expect, it } from 'vitest';

import { changeFraction, positionStats, summarizeHoldings } from './holdingsPerf';

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
