import { describe, expect, it } from 'vitest';

import {
  confirmRegimes,
  dcfInputsReady,
  drawdownEpisodes,
  labelRegimes,
  overviewToDcfInputs,
  regimeSegments,
  regimeShifts,
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
