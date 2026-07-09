import { mean, TRADING_DAYS } from './stats';
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

// Stress test: apply both σ-based daily shocks and canned historical crash days to
// a spot price. annualVolPct is this name's annualized vol (%); shocks are decimals.
// -> [{ label, shock, price, lossPct }] sorted worst-last.
export function stressScenarios(spot, annualVolPct) {
  const sigma = annualVolPct > 0 ? annualVolPct / 100 / Math.sqrt(TRADING_DAYS) : 0;
  const rows = [
    { label: '−1σ day', shock: -sigma },
    { label: '−2σ day', shock: -2 * sigma },
    { label: '−3σ day', shock: -3 * sigma },
    { label: 'GFC worst day (2008)', shock: -0.0903 },
    { label: 'COVID crash (Mar 2020)', shock: -0.12 },
    { label: 'Black Monday (1987)', shock: -0.2261 },
  ];
  return rows.map((r) => ({ ...r, price: spot * (1 + r.shock), lossPct: r.shock * 100 }));
}

// Drawdown recovery stats: walks the close series, grouping each peak-to-recovery
// underwater episode. threshold is the % depth (positive) that counts as a "real"
// drawdown episode. -> { maxDD, maxDDDuration, maxDDRecovered, recoveryDays,
// currentUnderwaterDays, episodes } or null.
export function drawdownStats(closes, threshold = 5) {
  if (closes.length < 2) return null;
  let peak = closes[0];
  let peakIdx = 0;
  let cur = null; // active underwater episode
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
  const currentUnderwaterDays = cur ? closes.length - 1 - cur.start : 0;
  if (cur) episodes.push({ ...cur, recoveredIdx: null, end: closes.length - 1 });
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

// Regime-shift detection: bucket each rolling-vol reading into Calm/Normal/Stressed
// by its percentile rank over the whole window, then find the transitions.
// -> { current, daysSince, shifts: [{ index, from, to }] (last 5) } or null.
export function regimeShifts(rollingVols) {
  if (rollingVols.length < 5) return null;
  const sorted = [...rollingVols].sort((a, b) => a - b);
  const bucket = (v) => {
    const pct = (sorted.filter((x) => x <= v).length / sorted.length) * 100;
    return pct < 33 ? 'Calm' : pct < 66 ? 'Normal' : 'Stressed';
  };
  const labels = rollingVols.map(bucket);
  const shifts = [];
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i] !== labels[i - 1]) shifts.push({ index: i, from: labels[i - 1], to: labels[i] });
  }
  const lastShiftIdx = shifts.length ? shifts[shifts.length - 1].index : 0;
  return {
    current: labels[labels.length - 1],
    daysSince: labels.length - 1 - lastShiftIdx,
    shifts: shifts.slice(-5),
  };
}
