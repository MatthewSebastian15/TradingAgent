import { normCDF } from './options';
import { kurtosis, mean, quantile, skewness, stdDev, TRADING_DAYS } from './stats';
import { mulberry32 } from './stochastic';

export function horizonReturns(closes, days) {
  const out = [];
  for (let i = days; i < closes.length; i += 1) {
    if (closes[i - days] > 0) out.push(closes[i] / closes[i - days] - 1);
  }
  return out;
}

export function scaleVaR(pct, days) {
  return Number.isFinite(pct) ? pct * Math.sqrt(days) : null;
}

// Percentile bootstrap. ponytail: i.i.d. resampling; overlapping multi-day samples
// are autocorrelated, so their interval is optimistic — the UI says so.
export function bootstrapCI(values, stat, { samples = 500, level = 0.9, seed = 7 } = {}) {
  const n = values.length;
  if (n < 20) return null;
  const rng = mulberry32(seed);
  const out = [];
  const draw = new Array(n);
  for (let s = 0; s < samples; s += 1) {
    for (let i = 0; i < n; i += 1) draw[i] = values[Math.floor(rng() * n)];
    const v = stat(draw);
    if (Number.isFinite(v)) out.push(v);
  }
  if (out.length < samples / 2) return null;
  out.sort((a, b) => a - b);
  const tail = (1 - level) / 2;
  return { lo: quantile(out, tail), hi: quantile(out, 1 - tail) };
}

// OLS of excess stock on excess market returns plus active-return statistics.
export function benchmarkStats(stockReturns, marketReturns, rf = 0, ppy = TRADING_DAYS) {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 20) return null;
  const s = stockReturns.slice(0, n);
  const m = marketReturns.slice(0, n);
  const xs = m.map((v) => v - rf);
  const ys = s.map((v) => v - rf);
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < n; i += 1) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (!sxx) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i += 1) {
    const e = ys[i] - a - b * xs[i];
    sse += e * e;
  }
  const seAlpha = Math.sqrt((sse / (n - 2)) * (1 / n + (mx * mx) / sxx));
  const active = s.map((v, i) => v - m[i]);
  const te = stdDev(active);
  const capture = (keep) => {
    const idx = m.map((v, i) => (keep(v) ? i : -1)).filter((i) => i >= 0);
    if (idx.length === 0) return null;
    const mm = mean(idx.map((i) => m[i]));
    return mm ? (mean(idx.map((i) => s[i])) / mm) * 100 : null;
  };
  return {
    observations: n,
    beta: b,
    alpha: a * ppy * 100,
    alphaTStat: seAlpha > 1e-15 ? a / seAlpha : null,
    correlation: syy ? sxy / Math.sqrt(sxx * syy) : null,
    rSquared: syy ? (sxy * sxy) / (sxx * syy) : null,
    trackingError: te * Math.sqrt(ppy) * 100,
    informationRatio: te ? (mean(active) / te) * Math.sqrt(ppy) : null,
    upCapture: capture((v) => v > 0),
    downCapture: capture((v) => v < 0),
  };
}

// Sharpe standard error with skew/kurtosis (Mertens 2002) and the Probabilistic
// Sharpe Ratio vs 0 (Bailey & López de Prado 2012). SE and t-stat are per-period.
export function sharpeStats(returns, rf = 0, ppy = TRADING_DAYS) {
  const n = returns.length;
  if (n < 20) return null;
  const sd = stdDev(returns);
  if (!sd) return null;
  const sr = (mean(returns) - rf) / sd;
  const g3 = skewness(returns) ?? 0;
  const g4 = (kurtosis(returns) ?? 0) + 3;
  const varTerm = 1 - g3 * sr + ((g4 - 1) / 4) * sr * sr;
  const se = varTerm > 0 ? Math.sqrt(varTerm / (n - 1)) : null;
  return {
    sharpe: sr * Math.sqrt(ppy),
    standardError: se === null ? null : se * Math.sqrt(ppy),
    tStat: se ? sr / se : null,
    probabilisticSharpe: se ? normCDF(sr / se) : null,
    observations: n,
  };
}
