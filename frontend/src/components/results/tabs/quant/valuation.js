import { mean, percentileRank, TRADING_DAYS } from './stats';
import { mulberry32, QUANTILE } from './stochastic';

export function dcf({ fcf, growth, years = 5, wacc, terminalGrowth, shares, netDebt = 0 }) {
  if (!(wacc > terminalGrowth) || !(shares > 0) || !(wacc > 0)) return null;
  let pv = 0;
  let cf = fcf;
  for (let t = 1; t <= years; t += 1) {
    cf *= 1 + growth;
    pv += cf / (1 + wacc) ** t;
  }
  const terminal = (cf * (1 + terminalGrowth)) / (wacc - terminalGrowth);
  pv += terminal / (1 + wacc) ** years;
  const equityValue = pv - netDebt;
  return { enterpriseValue: pv, equityValue, fairValuePerShare: equityValue / shares };
}

// DCF Monte Carlo: sample growth / wacc / terminalGrowth uniformly inside their
// [lo, hi] ranges (decimals) and collect the fair-value-per-share distribution.
// Seeded for reproducibility; draws that violate wacc > terminalGrowth are dropped.
// -> { p10, p50, p90, mean, values } or null if nothing was valid.
export function dcfMonteCarlo(base, ranges, paths = 2000, seed = 42) {
  const rng = mulberry32(seed);
  const pick = ([lo, hi]) => lo + rng() * (hi - lo);
  const values = [];
  for (let i = 0; i < paths; i += 1) {
    const r = dcf({
      ...base,
      growth: pick(ranges.growth),
      wacc: pick(ranges.wacc),
      terminalGrowth: pick(ranges.terminalGrowth),
    });
    if (r && Number.isFinite(r.fairValuePerShare)) values.push(r.fairValuePerShare);
  }
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: QUANTILE(sorted, 0.1),
    p50: QUANTILE(sorted, 0.5),
    p90: QUANTILE(sorted, 0.9),
    mean: mean(values),
    values,
  };
}

// One-day S&P 500 index moves; exact only when the benchmark is the S&P 500.
const SP500_CRASH_DAYS = [
  { label: 'GFC — S&P 500, 2008-10-15', date: '2008-10-15', indexShock: -0.0903 },
  { label: 'COVID — S&P 500, 2020-03-16', date: '2020-03-16', indexShock: -0.1198 },
  { label: 'Black Monday — S&P 500, 1987-10-19', date: '1987-10-19', indexShock: -0.2047 },
];

// Stress test: σ-based daily shocks from this name's annualized vol (%), plus index
// crash days scaled by beta (1 when unknown). Losses clamp at -100%.
// -> [{ label, shock, indexShock, price, lossPct }].
export function stressScenarios(spot, annualVolPct, beta = null, ppy = TRADING_DAYS) {
  const sigma = annualVolPct > 0 ? annualVolPct / 100 / Math.sqrt(ppy) : 0;
  const b = Number.isFinite(beta) ? beta : 1;
  const rows = [
    { label: '−1σ day', shock: -sigma, indexShock: null },
    { label: '−2σ day', shock: -2 * sigma, indexShock: null },
    { label: '−3σ day', shock: -3 * sigma, indexShock: null },
    ...SP500_CRASH_DAYS.map((e) => ({
      label: e.label,
      indexShock: e.indexShock,
      shock: Math.max(-1, b * e.indexShock),
    })),
  ];
  return rows.map((r) => ({ ...r, price: spot * (1 + r.shock), lossPct: r.shock * 100 }));
}

// Worst non-overlapping `days`-period returns, sorted worst-first, up to `count`.
// -> [{ days, startDate, endDate, returnPct }].
export function worstWindows(closes, dates, days, count = 1) {
  const candidates = [];
  for (let i = days; i < closes.length; i += 1) {
    if (closes[i - days] > 0) {
      candidates.push({ start: i - days, end: i, ret: closes[i] / closes[i - days] - 1 });
    }
  }
  candidates.sort((a, b) => a.ret - b.ret);
  const picked = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (picked.every((p) => c.end <= p.start || c.start >= p.end)) picked.push(c);
  }
  return picked.map((p) => ({
    days,
    startDate: dates[p.start],
    endDate: dates[p.end],
    returnPct: p.ret * 100,
  }));
}

const sigmaLabel = (k, days) => `${k > 0 ? '+' : '−'}${Math.abs(k)}σ · ${days}D`;

// Market-aware stress table: σ shocks scaled by sqrt-time, S&P 500 crash days (only
// when benchmarked to the S&P 500), benchmark/own empirical worst windows, and a
// custom shock. Losses clamp at -100%.
// -> [{ group, label, shock, indexShock, dates, price, lossPct }].
export function stressTable({
  spot,
  beta = null,
  dailySigma = 0,
  benchmarkIsSp500 = false,
  benchmarkWorst = [],
  stockWorst = [],
  customShockPct = null,
}) {
  const b = Number.isFinite(beta) ? beta : 1;
  const s = Number.isFinite(dailySigma) ? dailySigma : 0;
  const rows = [];
  for (const k of [-3, -2, -1, 1, 2, 3]) {
    rows.push({
      group: 'σ move (EWMA)',
      label: sigmaLabel(k, 1),
      shock: k * s,
      indexShock: null,
      dates: null,
    });
  }
  for (const days of [5, 20]) {
    for (const k of [-2, 2]) {
      rows.push({
        group: 'σ move (EWMA)',
        label: sigmaLabel(k, days),
        shock: k * s * Math.sqrt(days),
        indexShock: null,
        dates: null,
      });
    }
  }
  if (benchmarkIsSp500) {
    for (const e of SP500_CRASH_DAYS) {
      rows.push({
        group: 'Historical S&P 500 day',
        label: e.label,
        shock: b * e.indexShock,
        indexShock: e.indexShock,
        dates: e.date,
      });
    }
  }
  for (const w of benchmarkWorst) {
    rows.push({
      group: 'Benchmark worst (window)',
      label: `Benchmark worst ${w.days}D`,
      shock: (b * w.returnPct) / 100,
      indexShock: w.returnPct / 100,
      dates: `${w.startDate} → ${w.endDate}`,
    });
  }
  for (const w of stockWorst) {
    rows.push({
      group: 'This stock worst (window)',
      label: `Own worst ${w.days}D`,
      shock: w.returnPct / 100,
      indexShock: null,
      dates: `${w.startDate} → ${w.endDate}`,
    });
  }
  if (Number.isFinite(customShockPct)) {
    rows.push({
      group: 'Custom',
      label: 'Custom shock',
      shock: customShockPct / 100,
      indexShock: null,
      dates: null,
    });
  }
  return rows.map((r) => {
    const shock = Math.max(-1, r.shock);
    return { ...r, shock, price: spot * (1 + shock), lossPct: shock * 100 };
  });
}

// Peak-to-recovery underwater episodes, in time order.
export function drawdownEpisodes(closes) {
  if (closes.length < 2) return [];
  let peak = closes[0];
  let peakIdx = 0;
  let cur = null;
  const episodes = [];
  for (let i = 1; i < closes.length; i += 1) {
    const c = closes[i];
    if (c >= peak) {
      if (cur) {
        episodes.push({ ...cur, recoveredIdx: i, end: i });
        cur = null;
      }
      peak = c;
      peakIdx = i;
    } else if (!cur) {
      cur = { start: peakIdx, trough: c, troughIdx: i, depth: ((c - peak) / peak) * 100 };
    } else if (c < cur.trough) {
      cur.trough = c;
      cur.troughIdx = i;
      cur.depth = ((c - peak) / peak) * 100;
    }
  }
  if (cur) episodes.push({ ...cur, recoveredIdx: null, end: closes.length - 1 });
  return episodes;
}

// Drawdown recovery stats: summarizes drawdownEpisodes() into the single deepest
// episode. threshold is the % depth (positive) that counts as a "real" drawdown
// episode. -> { maxDD, maxDDDuration, maxDDRecovered, recoveryDays,
// currentUnderwaterDays, episodes } or null.
export function drawdownStats(closes, threshold = 5) {
  if (closes.length < 2) return null;
  const episodes = drawdownEpisodes(closes);
  const open = episodes.find((e) => e.recoveredIdx === null);
  const currentUnderwaterDays = open ? closes.length - 1 - open.start : 0;
  if (episodes.length === 0) {
    return {
      maxDD: 0,
      maxDDDuration: 0,
      maxDDRecovered: true,
      recoveryDays: null,
      currentUnderwaterDays: 0,
      episodes: 0,
    };
  }
  const maxEp = episodes.reduce((a, e) => (e.depth < a.depth ? e : a));
  return {
    maxDD: maxEp.depth,
    maxDDDuration: (maxEp.recoveredIdx ?? maxEp.end) - maxEp.start,
    maxDDRecovered: maxEp.recoveredIdx != null,
    recoveryDays: maxEp.recoveredIdx != null ? maxEp.recoveredIdx - maxEp.troughIdx : null,
    currentUnderwaterDays,
    episodes: episodes.filter((e) => e.depth <= -threshold).length,
  };
}

// Top drawdown episodes, deepest first, with dates instead of indices.
export function topDrawdowns(closes, dates, count = 5) {
  return drawdownEpisodes(closes)
    .sort((a, b) => a.depth - b.depth)
    .slice(0, count)
    .map((e) => ({
      peakDate: dates[e.start],
      troughDate: dates[e.troughIdx],
      recoveryDate: e.recoveredIdx === null ? null : dates[e.recoveredIdx],
      depth: e.depth,
      lengthDays: (e.recoveredIdx ?? e.end) - e.start,
      recoveryDays: e.recoveredIdx === null ? null : e.recoveredIdx - e.troughIdx,
    }));
}

const regimeFor = (pct) => (pct < 33 ? 'Calm' : pct < 66 ? 'Normal' : 'Stressed');

// Buckets each reading into Calm/Normal/Stressed by its mid-rank percentile
// within the whole series.
export function labelRegimes(vols) {
  return vols.map((v) => regimeFor(percentileRank(vols, v)));
}

// A new regime counts only after `minDuration` consecutive readings; once confirmed it
// is back-dated to the start of that run so the timeline shows when it really began.
export function confirmRegimes(labels, minDuration = 5) {
  if (labels.length === 0) return [];
  const out = new Array(labels.length);
  let current = labels[0];
  let runStart = 0;
  out[0] = current;
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] !== labels[i - 1]) runStart = i;
    if (labels[i] !== current && i - runStart + 1 >= minDuration) {
      for (let k = runStart; k <= i; k += 1) out[k] = labels[i];
      current = labels[i];
    } else {
      out[i] = current;
    }
  }
  return out;
}

// Groups contiguous confirmed labels into date ranges; `to` is the next segment's `from`
// so segments tile the timeline with no gaps.
export function regimeSegments(labels, dates) {
  const segments = [];
  labels.forEach((label, i) => {
    const date = dates[i];
    if (!date) return;
    const last = segments.at(-1);
    if (last && last.label === label) last.to = date;
    else segments.push({ label, from: date, to: date });
  });
  for (let i = 0; i < segments.length - 1; i += 1) segments[i].to = segments[i + 1].from;
  return segments;
}

// Regime-shift detection: label each rolling-vol reading, confirm it with hysteresis
// (see confirmRegimes) so a single noisy day doesn't flip the regime, then find the
// transitions in the confirmed labels.
// -> { current, daysSince, shifts: [{ index, from, to }] (last 5), labels } or null.
export function regimeShifts(rollingVols, { minDuration = 5 } = {}) {
  if (rollingVols.length < 5) return null;
  const labels = confirmRegimes(labelRegimes(rollingVols), minDuration);
  const shifts = [];
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] !== labels[i - 1]) shifts.push({ index: i, from: labels[i - 1], to: labels[i] });
  }
  const lastShiftIdx = shifts.length ? shifts.at(-1).index : 0;
  return {
    current: labels.at(-1),
    daysSince: labels.length - 1 - lastShiftIdx,
    shifts: shifts.slice(-5),
    labels,
  };
}

const round1 = (x) => Number(x.toFixed(1));

// A DCF needs a real base FCF and share count; never value dummy defaults.
export function dcfInputsReady({ fcf, shares }) {
  return fcf !== '' && fcf !== null && Number.isFinite(Number(fcf)) && Number(shares) > 0;
}

// yfinance reports FCF/debt/cash/shares in absolute units; DCF inputs are millions.
export function overviewToDcfInputs(overview) {
  if (!overview || typeof overview !== 'object') return {};
  const M = 1e6;
  const out = {};
  if (Number.isFinite(overview.free_cashflow)) out.fcf = round1(overview.free_cashflow / M);
  if (Number.isFinite(overview.shares_outstanding)) {
    out.shares = round1(overview.shares_outstanding / M);
  }
  if (Number.isFinite(overview.total_debt) || Number.isFinite(overview.total_cash)) {
    const debt = Number.isFinite(overview.total_debt) ? overview.total_debt : 0;
    const cash = Number.isFinite(overview.total_cash) ? overview.total_cash : 0;
    out.netDebt = round1((debt - cash) / M);
  }
  if (Number.isFinite(overview.earnings_growth)) {
    out.growth = round1(Math.max(0, Math.min(25, overview.earnings_growth * 100)));
  }
  return out;
}
