import { describe, expect, it } from 'vitest';

import { lotSizeForSymbol, positionSize } from './sizing';

describe('positionSize', () => {
  it('sizes an IDX position by risk and rounds to lots of 100', () => {
    expect(
      positionSize({ capital: 100_000_000, entry: 9000, stop: 8550, riskPct: 1, lotSize: 100 })
    ).toEqual({
      shares: 2200,
      lots: 22,
      positionValue: 19_800_000,
      capitalPct: 19.8,
      riskAmount: 990_000,
      cappedByCapital: false,
    });
  });

  it('caps by available capital', () => {
    const out = positionSize({ capital: 10_000, entry: 100, stop: 99, riskPct: 5 });
    expect(out.shares).toBe(100);
    expect(out.cappedByCapital).toBe(true);
  });

  it('rejects invalid inputs', () => {
    expect(positionSize({ capital: 1000, entry: 100, stop: 100, riskPct: 1 })).toBeNull();
    expect(positionSize({ capital: 0, entry: 100, stop: 90, riskPct: 1 })).toBeNull();
  });
});

describe('lotSizeForSymbol', () => {
  it('uses 100-share lots for IDX', () => {
    expect(lotSizeForSymbol('BBCA.JK')).toBe(100);
    expect(lotSizeForSymbol('AAPL')).toBe(1);
  });
});
