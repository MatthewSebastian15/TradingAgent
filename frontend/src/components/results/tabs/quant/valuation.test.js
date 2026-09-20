import { describe, expect, it } from 'vitest';

import { dcfInputsReady, overviewToDcfInputs, stressScenarios } from './valuation';

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

describe('stressScenarios beta scaling', () => {
  const historical = (rows) => rows.filter((r) => r.indexShock !== null);

  it('scales index crash days by beta and leaves sigma rows alone', () => {
    const one = stressScenarios(100, 32, 1);
    const half = stressScenarios(100, 32, 0.5);
    historical(half).forEach((row, i) => {
      expect(row.shock).toBeCloseTo(0.5 * historical(one)[i].indexShock, 12);
    });
    expect(half[0].shock).toBeCloseTo(one[0].shock, 12);
  });

  it('uses the S&P 500 Black Monday move and clamps losses at -100%', () => {
    const row = stressScenarios(100, 20, 1).find((r) => r.label.startsWith('Black Monday'));
    expect(row.indexShock).toBeCloseTo(-0.2047, 10);
    const levered = stressScenarios(100, 20, 6).find((r) => r.label.startsWith('Black Monday'));
    expect(levered.shock).toBe(-1);
    expect(levered.price).toBe(0);
  });

  it('missing beta falls back to 1', () => {
    const rows = historical(stressScenarios(100, 20, null));
    expect(rows[0].shock).toBeCloseTo(rows[0].indexShock, 12);
  });
});
