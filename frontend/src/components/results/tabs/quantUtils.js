// Pure quant math for the Quant tab. No React here — plain numbers/arrays in
// and out, so every function is trivially testable in isolation.
//
// PARITY NOTE: annualizedVol and maxDrawdown must return the same numbers as the
// Python reference in packages/tradingagents/risk/market_risk_builder.py. That
// reference uses SIMPLE returns and SAMPLE stddev (statistics.stdev, n-1) — not
// log returns — so annualizedVol does too. logReturns exists as a building block
// for later metrics (VaR etc.), not for the volatility figure.

const TRADING_DAYS = 252;

export function simpleReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    if (prev) out.push((closes[i] - prev) / prev);
  }
  return out;
}

export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    if (prev > 0 && closes[i] > 0) out.push(Math.log(closes[i] / prev));
  }
  return out;
}

export function mean(xs) {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Sample standard deviation (n-1), matching Python statistics.stdev.
export function stdDev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const variance = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(variance);
}

// -> annualized volatility in %, or null if there aren't enough returns.
export function annualizedVol(closes, periodsPerYear = TRADING_DAYS) {
  const returns = simpleReturns(closes);
  if (returns.length < 2) return null;
  return stdDev(returns) * Math.sqrt(periodsPerYear) * 100;
}

// -> number[] of annualized vol, one per window position (no dates; the
// component zips these against its own date axis).
export function rollingVol(closes, window = 21) {
  const returns = simpleReturns(closes);
  const out = [];
  for (let end = window; end <= returns.length; end += 1) {
    const slice = returns.slice(end - window, end);
    out.push(stdDev(slice) * Math.sqrt(TRADING_DAYS) * 100);
  }
  return out;
}

// Exponentially weighted volatility (RiskMetrics), recent days weighted more.
// -> annualized %, or 0 for a flat series.
export function ewmaVol(closes, lambda = 0.94) {
  const returns = simpleReturns(closes);
  if (returns.length === 0) return 0;
  let variance = returns[0] ** 2;
  for (let i = 1; i < returns.length; i += 1) {
    variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
  }
  return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100;
}

// Worst peak-to-trough decline in %, 0 if the series never drops.
// Mirrors Python _max_drawdown exactly.
export function maxDrawdown(closes) {
  let peak = null;
  let worst = 0;
  for (const close of closes) {
    if (peak === null || close > peak) {
      peak = close;
      continue;
    }
    if (peak) worst = Math.min(worst, ((close - peak) / peak) * 100);
  }
  return worst;
}

// --- risk -----------------------------------------------------------------
// VaR/CVaR are returned as SIGNED percentages (a bad day is negative), so the
// "more negative = worse" ordering holds and cvar <= historicalVaR by design.

// Historical 95% VaR: the return at the (1-alpha) percentile of real history.
export function historicalVaR(returns, alpha = 0.95) {
  if (returns.length < 2) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((1 - alpha) * sorted.length));
  return sorted[idx] * 100;
}

// Parametric (normal) VaR. z=1.645 for 95%; v1 only ever asks for 95%.
// ponytail: single hard-coded z, not a z-table. Add a table if other levels ship.
export function parametricVaR(returns, alpha = 0.95) {
  if (returns.length < 2) return null;
  const z = alpha === 0.95 ? 1.645 : 1.645;
  return (mean(returns) - z * stdDev(returns)) * 100;
}

// Conditional VaR / Expected Shortfall: mean of the worst tail beyond the VaR
// threshold. Always <= historicalVaR (the tail mean can't beat its own cutoff).
export function cvar(returns, alpha = 0.95) {
  if (returns.length < 2) return null;
  const sorted = [...returns].sort((a, b) => a - b);
  const count = Math.max(1, Math.floor((1 - alpha) * sorted.length));
  return mean(sorted.slice(0, count)) * 100;
}

// Per-period downside deviation (only negative excursions below mar).
function downsideDeviationPeriodic(returns, mar = 0) {
  if (returns.length === 0) return 0;
  const sumSq = returns.reduce((a, r) => a + Math.min(0, r - mar) ** 2, 0);
  return Math.sqrt(sumSq / returns.length);
}

// Annualized downside deviation in % — volatility of only the bad days.
export function downsideDeviation(returns, mar = 0) {
  return downsideDeviationPeriodic(returns, mar) * Math.sqrt(TRADING_DAYS) * 100;
}

// Sharpe: excess return per unit of total risk, annualized. v1 uses rf=0.
export function sharpe(returns, rf = 0) {
  const sd = stdDev(returns);
  if (returns.length < 2 || !sd) return null;
  return ((mean(returns) - rf) / sd) * Math.sqrt(TRADING_DAYS);
}

// Sortino: like Sharpe but penalizes only downside risk. v1 uses rf=0.
export function sortino(returns, rf = 0) {
  const dd = downsideDeviationPeriodic(returns, rf);
  if (returns.length < 2 || !dd) return null;
  return ((mean(returns) - rf) / dd) * Math.sqrt(TRADING_DAYS);
}

// --- stochastic -----------------------------------------------------------

// Seeded PRNG (mulberry32) -> deterministic () => float in [0,1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One standard-normal draw via Box–Muller, fed by a seeded rng.
export function randNormal(rng) {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const QUANTILE = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

// Geometric Brownian Motion Monte Carlo. mu/sigma are per-day (log) estimates.
// Returns terminal prices, <=10 sample paths, a per-step p10/p50/p90 band, and
// the terminal p10/p50/p90. dt = 1 day.
// ponytail: stores the full paths x days matrix to compute the band. Fine at the
// capped 5000 x 126 (~5MB, a few ms); switch to online quantiles only if caps grow.
export function monteCarloGBM(spot, mu, sigma, days, paths, seed) {
  const rng = mulberry32(seed);
  const drift = mu - 0.5 * sigma * sigma;
  const all = [];
  for (let p = 0; p < paths; p += 1) {
    const path = new Array(days + 1);
    path[0] = spot;
    let price = spot;
    for (let d = 1; d <= days; d += 1) {
      price *= Math.exp(drift + sigma * randNormal(rng));
      path[d] = price;
    }
    all.push(path);
  }
  const terminal = all.map((p) => p[days]);
  const sortedTerminal = [...terminal].sort((a, b) => a - b);
  const band = [];
  for (let d = 0; d <= days; d += 1) {
    const col = all.map((p) => p[d]).sort((a, b) => a - b);
    band.push({
      step: d,
      p10: QUANTILE(col, 0.1),
      p50: QUANTILE(col, 0.5),
      p90: QUANTILE(col, 0.9),
    });
  }
  return {
    terminal,
    samplePaths: all.slice(0, Math.min(10, paths)),
    band,
    percentiles: {
      p10: QUANTILE(sortedTerminal, 0.1),
      p50: QUANTILE(sortedTerminal, 0.5),
      p90: QUANTILE(sortedTerminal, 0.9),
    },
  };
}

// Bin any number array into a histogram. Works for returns or terminal prices.
export function returnHistogram(values, bins = 30) {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const width = (max - min) / bins || 1;
  const out = Array.from({ length: bins }, (_, i) => ({
    binStart: min + i * width,
    binEnd: min + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.max(0, Math.floor((v - min) / width)));
    out[idx].count += 1;
  }
  return out;
}
