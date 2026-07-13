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

// Daily EWMA sigma (decimal, not annualized) — input for VaR/MC, not display.
export function ewmaSigmaDaily(returns, lambda = 0.94) {
  if (returns.length === 0) return 0;
  let variance = returns[0] ** 2;
  for (let i = 1; i < returns.length; i += 1) {
    variance = lambda * variance + (1 - lambda) * returns[i] ** 2;
  }
  return Math.sqrt(variance);
}

// Exponentially weighted volatility (RiskMetrics), recent days weighted more.
// -> annualized %, or 0 for a flat series.
export function ewmaVol(closes, lambda = 0.94) {
  return ewmaSigmaDaily(simpleReturns(closes), lambda) * Math.sqrt(TRADING_DAYS) * 100;
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
