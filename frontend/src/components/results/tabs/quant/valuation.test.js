import { describe, expect, it } from 'vitest';

import {
  dcfInputsReady,
  drawdownEpisodes,
  overviewToDcfInputs,
  stressScenarios,
  topDrawdowns,
} from './valuation';

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

describe('stressScenarios ppy', () => {
  it('sigma rows use the daily sigma for the given ppy', () => {
    const row = stressScenarios(100, 30, 1, 365)[0];
    expect(row.shock).toBeCloseTo(-0.3 / Math.sqrt(365), 12);
  });
});

describe('topDrawdowns', () => {
  const closes = [100, 90, 80, 90, 101, 95, 101.5, 70];
  const dates = closes.map((_, i) => `d${i}`);

  it('lists episodes deepest first with dates and durations', () => {
    expect(drawdownEpisodes(closes)).toHaveLength(3);
    const [first, second] = topDrawdowns(closes, dates);
    expect(first).toMatchObject({
      peakDate: 'd6',
      troughDate: 'd7',
      recoveryDate: null,
      lengthDays: 1,
      recoveryDays: null,
    });
    expect(first.depth).toBeCloseTo((70 / 101.5 - 1) * 100, 10);
    expect(second).toMatchObject({
      peakDate: 'd0',
      troughDate: 'd2',
      recoveryDate: 'd4',
      lengthDays: 4,
      recoveryDays: 2,
    });
  });

  it('breaks ties on equal depth by keeping original time order (stable sort)', () => {
    const tiedCloses = [100, 90, 100, 90, 100];
    const tiedDates = tiedCloses.map((_, i) => `t${i}`);
    const [first, second] = topDrawdowns(tiedCloses, tiedDates);
    expect(first.depth).toBeCloseTo(second.depth, 10);
    expect(first.peakDate).toBe('t0');
    expect(second.peakDate).toBe('t2');
  });
});
