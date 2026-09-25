import { describe, expect, it } from 'vitest';

import {
  capmWacc,
  confirmRegimes,
  dcf,
  dcfInputsReady,
  dcfMonteCarlo,
  drawdownEpisodes,
  impliedGrowth,
  labelRegimes,
  overviewToDcfInputs,
  peerMultiples,
  regimeSegments,
  regimeShifts,
  reportingCurrencyMismatch,
  stressTable,
  topDrawdowns,
  worstWindows,
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
      overviewToDcfInputs(
        {
          free_cashflow: 2_000_000_000,
          shares_outstanding: 100_000_000,
          total_debt: 500_000_000,
          total_cash: 100_000_000,
          earnings_growth: 0.42,
        },
        { growthSource: 'earnings' }
      )
    ).toEqual({ fcf: 2000, shares: 100, netDebt: 400, growth: 25 });
  });

  it('omits fields that are missing', () => {
    expect(overviewToDcfInputs({ shares_outstanding: 5_000_000 })).toEqual({ shares: 5 });
    expect(overviewToDcfInputs(null)).toEqual({});
  });
});

describe('dcf 3-stage', () => {
  const base = { fcf: 100, growth: 0.2, years: 5, wacc: 0.1, terminalGrowth: 0.02, shares: 10 };

  it('fades growth linearly toward terminal growth', () => {
    const r = dcf({ ...base, fadeYears: 3 });
    expect(r.flows.map((f) => f.growth).slice(5)).toEqual([
      expect.closeTo(0.155, 12),
      expect.closeTo(0.11, 12),
      expect.closeTo(0.065, 12),
    ]);
  });

  it('mid-year discounting raises value; terminal share is a fraction', () => {
    const end = dcf(base);
    const mid = dcf({ ...base, midYear: true });
    expect(mid.enterpriseValue).toBeGreaterThan(end.enterpriseValue);
    expect(end.terminalShare).toBeGreaterThan(0);
    expect(end.terminalShare).toBeLessThan(1);
  });
});

describe('capmWacc', () => {
  it('weights cost of equity and after-tax debt', () => {
    const w = capmWacc({
      rf: 0.04,
      beta: 1.2,
      erp: 0.05,
      costOfDebt: 0.06,
      taxRate: 0.25,
      marketCap: 800,
      totalDebt: 200,
    });
    expect(w.costOfEquity).toBeCloseTo(0.1, 12);
    expect(w.afterTaxCostOfDebt).toBeCloseTo(0.045, 12);
    expect(w.wacc).toBeCloseTo(0.089, 12);
  });

  it('falls back to cost of equity without market cap', () => {
    expect(capmWacc({ rf: 0.04, beta: 1, erp: 0.05 }).wacc).toBeCloseTo(0.09, 12);
    expect(capmWacc({ rf: 0.04, beta: null, erp: 0.05 })).toBeNull();
  });
});

describe('impliedGrowth', () => {
  it('recovers the growth rate priced in', () => {
    const base = {
      fcf: 100,
      years: 5,
      fadeYears: 2,
      wacc: 0.09,
      terminalGrowth: 0.025,
      shares: 10,
      netDebt: 50,
    };
    const price = dcf({ ...base, growth: 0.07 }).fairValuePerShare;
    expect(impliedGrowth(base, price)).toBeCloseTo(0.07, 6);
    expect(impliedGrowth({ ...base, fcf: -5 }, price)).toBeNull();
  });
});

describe('dcfMonteCarlo triangular', () => {
  it('is less dispersed than uniform over the same ranges', () => {
    const base = { fcf: 100, years: 5, shares: 10, netDebt: 0 };
    const ranges = { growth: [0.03, 0.11], wacc: [0.08, 0.11], terminalGrowth: [0.015, 0.03] };
    const tri = dcfMonteCarlo(base, ranges, 3000, 5);
    const uni = dcfMonteCarlo(base, ranges, 3000, 5, { distribution: 'uniform' });
    expect(tri.p90 - tri.p10).toBeLessThan(uni.p90 - uni.p10);
  });
});

describe('currency and peers', () => {
  const overview = {
    free_cashflow: 5e8,
    shares_outstanding: 1e9,
    total_debt: 2e8,
    total_cash: 1e8,
    revenue_growth: 0.08,
    financial_currency: 'USD',
  };

  it('does not mix currencies without an FX rate', () => {
    expect(reportingCurrencyMismatch(overview, 'IDR')).toBe(true);
    expect(overviewToDcfInputs(overview, { tradingCurrency: 'IDR' })).toEqual({
      shares: 1000,
      growth: 8,
    });
    expect(overviewToDcfInputs(overview, { tradingCurrency: 'IDR', fxRate: 16000 })).toMatchObject({
      fcf: 8_000_000,
      netDebt: 1_600_000,
    });
  });

  it('computes peer medians and premiums, ignoring non-positive multiples', () => {
    const rows = peerMultiples({ pe_ttm: 20 }, [{ pe_ttm: 10 }, { pe_ttm: 15 }, { pe_ttm: -4 }]);
    const pe = rows.find((r) => r.key === 'pe_ttm');
    expect(pe.peerMedian).toBe(12.5);
    expect(pe.peerCount).toBe(2);
    expect(pe.premiumPct).toBeCloseTo(60, 10);
  });
});

describe('worstWindows', () => {
  const closes = [100, 90, 95, 70, 80, 85];
  const dates = closes.map((_, i) => `d${i}`);

  it('returns the worst non-overlapping windows', () => {
    const rows = worstWindows(closes, dates, 1, 2);
    expect(rows.map((r) => [r.startDate, r.endDate])).toEqual([
      ['d2', 'd3'],
      ['d0', 'd1'],
    ]);
    expect(rows[0].returnPct).toBeCloseTo((70 / 95 - 1) * 100, 10);
  });
});

describe('stressTable', () => {
  const base = { spot: 100, beta: 1.5, dailySigma: 0.02 };
  const labels = (rows) => rows.map((r) => r.label);

  it('builds symmetric sigma rows with sqrt-time scaling', () => {
    const rows = stressTable(base);
    expect(rows.find((r) => r.label === '−3σ · 1D').shock).toBeCloseTo(-0.06, 12);
    expect(rows.find((r) => r.label === '+2σ · 20D').shock).toBeCloseTo(0.04 * Math.sqrt(20), 12);
  });

  it('adds S&P 500 crash days only for S&P benchmarked names, scaled by beta', () => {
    expect(labels(stressTable(base)).some((l) => l.startsWith('Black Monday'))).toBe(false);
    const row = stressTable({ ...base, benchmarkIsSp500: true }).find((r) =>
      r.label.startsWith('Black Monday')
    );
    expect(row.shock).toBeCloseTo(1.5 * -0.2047, 12);
  });

  it('adds empirical and custom rows and clamps at -100%', () => {
    const rows = stressTable({
      ...base,
      beta: 4,
      benchmarkWorst: [{ days: 1, startDate: 'a', endDate: 'b', returnPct: -30 }],
      stockWorst: [{ days: 5, startDate: 'c', endDate: 'd', returnPct: -18 }],
      customShockPct: -7,
    });
    const bench = rows.find((r) => r.label === 'Benchmark worst 1D');
    expect(bench.shock).toBe(-1);
    expect(bench.price).toBe(0);
    expect(rows.find((r) => r.label === 'Own worst 5D').shock).toBeCloseTo(-0.18, 12);
    expect(rows.find((r) => r.label === 'Custom shock').price).toBeCloseTo(93, 10);
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

describe('regime hysteresis', () => {
  const raw = [
    ...Array(10).fill('Calm'),
    'Stressed',
    'Stressed',
    ...Array(5).fill('Calm'),
    ...Array(6).fill('Stressed'),
  ];

  it('ignores short blips and back-dates confirmed switches', () => {
    const out = confirmRegimes(raw, 5);
    expect(out.slice(0, 17).every((l) => l === 'Calm')).toBe(true);
    expect(out.slice(17).every((l) => l === 'Stressed')).toBe(true);
  });

  it('labels by mid-rank percentile', () => {
    expect(labelRegimes([10, 10, 10, 11, 40, 42, 45]).at(-1)).toBe('Stressed');
    expect(labelRegimes([10, 10, 10, 11, 40, 42, 45])[0]).toBe('Calm');
  });

  it('segments contiguous labels and joins them end to start', () => {
    expect(regimeSegments(['Calm', 'Calm', 'Stressed'], ['a', 'b', 'c'])).toEqual([
      { label: 'Calm', from: 'a', to: 'c' },
      { label: 'Stressed', from: 'c', to: 'c' },
    ]);
  });

  it('regimeShifts exposes confirmed labels', () => {
    const r = regimeShifts([...Array(20).fill(10), ...Array(8).fill(40)]);
    expect(r.labels).toHaveLength(28);
    expect(r.current).toBe('Stressed');
    expect(r.daysSince).toBe(7);
  });
});
