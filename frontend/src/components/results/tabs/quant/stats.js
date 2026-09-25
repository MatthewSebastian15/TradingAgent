// Pure quant math for the Quant tab. No React here — plain numbers/arrays in
// and out, so every function is trivially testable in isolation.
//
// PARITY NOTE: annualizedVol and maxDrawdown must return the same numbers as the
// Python reference in packages/tradingagents/risk/market_risk_builder.py. That
// reference uses SIMPLE returns and SAMPLE stddev (statistics.stdev, n-1) — not
// log returns — so annualizedVol does too. logReturns exists as a building block
// for later metrics (VaR etc.), not for the volatility figure.

export const TRADING_DAYS = 252;

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

// Linear-interpolated quantile of an ascending array (Hyndman-Fan type 7).
// p is clamped to [0, 1]; the caller must pass finite, sorted values.
export function quantile(sorted, p) {
  const n = sorted.length;
  if (n === 0) return null;
  const h = (n - 1) * Math.min(1, Math.max(0, p));
  const lo = Math.floor(h);
  const hi = Math.min(n - 1, lo + 1);
  return sorted[lo] + (h - lo) * (sorted[hi] - sorted[lo]);
}

// Median of the finite values; filter() copies, so the input is not mutated.
export function median(xs) {
  return quantile(
    xs.filter(Number.isFinite).sort((a, b) => a - b),
    0.5
  );
}

// -> annualized volatility in %, or null if there aren't enough returns.
export function annualizedVol(closes, periodsPerYear = TRADING_DAYS) {
  const returns = simpleReturns(closes);
  if (returns.length < 2) return null;
  return stdDev(returns) * Math.sqrt(periodsPerYear) * 100;
}

// -> number[] of annualized vol, one per window position (no dates; the
// component zips these against its own date axis).
export function rollingVol(closes, window = 21, ppy = TRADING_DAYS) {
  const returns = simpleReturns(closes);
  const out = [];
  for (let end = window; end <= returns.length; end += 1) {
    const slice = returns.slice(end - window, end);
    out.push(stdDev(slice) * Math.sqrt(ppy) * 100);
  }
  return out;
}

// EWMA daily variance path (decimal, not annualized). Seeded with the mean square
// of the first `seedWindow` returns so one extreme first day cannot dominate the
// recursion. out[i] covers returns up to index k - 1 + i (k = min(seedWindow, n)).
export function ewmaVarianceSeries(returns, lambda = 0.94, seedWindow = 20) {
  const n = returns.length;
  if (n === 0) return [];
  const k = Math.min(seedWindow, n);
  let variance = 0;
  for (let i = 0; i < k; i += 1) variance += returns[i] ** 2;
  variance /= k;
  const out = [variance];
  for (let i = k; i < n; i += 1) {
    variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
    out.push(variance);
  }
  return out;
}

// Daily EWMA sigma (decimal, not annualized) — input for VaR/MC, not display.
export function ewmaSigmaDaily(returns, lambda = 0.94, seedWindow = 20) {
  const series = ewmaVarianceSeries(returns, lambda, seedWindow);
  return series.length ? Math.sqrt(series.at(-1)) : 0;
}

// Exponentially weighted volatility (RiskMetrics), recent days weighted more.
// -> annualized %, or 0 for a flat series.
export function ewmaVol(closes, lambda = 0.94, ppy = TRADING_DAYS) {
  return ewmaSigmaDaily(simpleReturns(closes), lambda) * Math.sqrt(ppy) * 100;
}

// 7-day markets (crypto) trade on weekends; annualize them over 365 periods.
export function periodsPerYearFromDates(dates) {
  const days = (dates || [])
    .map((d) => new Date(`${String(d).slice(0, 10)}T00:00:00Z`).getUTCDay())
    .filter(Number.isFinite);
  if (days.length < 10) return TRADING_DAYS;
  const weekend = days.filter((d) => d === 0 || d === 6).length;
  return weekend / days.length >= 0.1 ? 365 : TRADING_DAYS;
}

// --- distribution shape ----------------------------------------------------
// Small-sample adjusted estimators (Excel SKEW / KURT, pandas default).
// Live here (not series.js) so risk.js can import them without an import cycle.

function centralMoments(xs) {
  const n = xs.length;
  const m = mean(xs);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of xs) {
    const d = x - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  return { n, m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

// Adjusted Fisher-Pearson skewness G1; null below 3 points, 0 for flat input.
export function skewness(xs) {
  if (xs.length < 3) return null;
  const { n, m2, m3 } = centralMoments(xs);
  if (!m2) return 0;
  const g1 = m3 / m2 ** 1.5;
  return (g1 * Math.sqrt(n * (n - 1))) / (n - 2);
}

// Adjusted excess kurtosis G2: ~0 for a normal distribution, >0 for fat tails.
// null below 4 points, 0 for flat input.
export function kurtosis(xs) {
  if (xs.length < 4) return null;
  const { n, m2, m4 } = centralMoments(xs);
  if (!m2) return 0;
  const g2 = m4 / (m2 * m2) - 3;
  return (((n + 1) * g2 + 6) * (n - 1)) / ((n - 2) * (n - 3));
}

// Percentile rank with ties counted half below, so a flat stretch sits mid-range.
export function percentileRank(values, v) {
  let below = 0;
  let equal = 0;
  for (const x of values) {
    if (x < v) below += 1;
    else if (x === v) equal += 1;
  }
  return values.length ? ((below + 0.5 * equal) / values.length) * 100 : null;
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
