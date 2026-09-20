import { describe, expect, it } from 'vitest';

import { dcfInputsReady, overviewToDcfInputs } from './valuation';

describe('dcfInputsReady', () => {
  it('requires a numeric FCF and positive shares', () => {
    expect(dcfInputsReady({ fcf: '', shares: 100 })).toBe(false);
    expect(dcfInputsReady({ fcf: 1000, shares: '' })).toBe(false);
    expect(dcfInputsReady({ fcf: -50, shares: 10 })).toBe(true);
    expect(dcfInputsReady({ fcf: 0, shares: 10 })).toBe(true);
  });
});

describe('overviewToDcfInputs', () => {
  it('scales absolute yfinance values to millions and clamps growth', () => {
    expect(
      overviewToDcfInputs({
        free_cashflow: 2_000_000_000,
        shares_outstanding: 100_000_000,
        total_debt: 500_000_000,
        total_cash: 100_000_000,
        earnings_growth: 0.42,
      })
    ).toEqual({ fcf: 2000, shares: 100, netDebt: 400, growth: 25 });
  });

  it('omits fields that are missing', () => {
    expect(overviewToDcfInputs({ shares_outstanding: 5_000_000 })).toEqual({ shares: 5 });
    expect(overviewToDcfInputs(null)).toEqual({});
  });
});
