import { beta } from './benchmark';
import { sharpe } from './risk';
import { maxDrawdown, mean, stdDev, TRADING_DAYS } from './stats';

// --- distribution shape (Phase 4) -----------------------------------------
// Population moments (÷n) — standard for sample skew/kurtosis descriptors.

export function skewness(xs) {
  const n = xs.length;
  if (n < 3) return null;
  const m = mean(xs);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / n);
  if (!s) return 0;
  const m3 = xs.reduce((a, x) => a + (x - m) ** 3, 0) / n;
  return m3 / s ** 3;
}

// Excess kurtosis: 0 for a normal distribution, >0 for fat tails.
export function kurtosis(xs) {
  const n = xs.length;
  if (n < 4) return null;
  const m = mean(xs);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / n);
  if (!s) return 0;
  const m4 = xs.reduce((a, x) => a + (x - m) ** 4, 0) / n;
  return m4 / s ** 4 - 3;
}

// --- drawdown / rolling series (Phase 4) ----------------------------------

// Underwater curve: % below the running peak at each point (<= 0).
export function drawdownSeries(closes) {
  let peak = null;
  return closes.map((close) => {
    if (peak === null || close > peak) peak = close;
    return peak ? ((close - peak) / peak) * 100 : 0;
  });
}

// Annualized Sharpe over a sliding window; entries can be null (flat window).
export function rollingSharpe(returns, window = 63, rf = 0) {
  const out = [];
  for (let end = window; end <= returns.length; end += 1) {
    out.push(sharpe(returns.slice(end - window, end), rf));
  }
  return out;
}

// Beta vs benchmark over a sliding window; entries can be null.
export function rollingBeta(stockReturns, marketReturns, window = 63) {
  const n = Math.min(stockReturns.length, marketReturns.length);
  const out = [];
  for (let end = window; end <= n; end += 1) {
    out.push(beta(stockReturns.slice(end - window, end), marketReturns.slice(end - window, end)));
  }
  return out;
}

// Calmar: CAGR ÷ |max drawdown|. null if no history or no drawdown.
export function calmar(closes) {
  const n = closes.length;
  if (n < 2 || !closes[0]) return null;
  const years = (n - 1) / TRADING_DAYS;
  if (years <= 0) return null;
  const cagr = (closes.at(-1) / closes[0]) ** (1 / years) - 1;
  const dd = maxDrawdown(closes) / 100;
  if (dd === 0) return null;
  return cagr / Math.abs(dd);
}

// --- regime / persistence (Phase 4) ---------------------------------------

// Hurst exponent via single-window rescaled-range (R/S). >0.5 trending,
// <0.5 mean-reverting, ~0.5 random walk.
// ponytail: crude one-window R/S. Upgrade to multi-window log-log regression
// if a tighter estimate is ever needed.
export function hurst(xs) {
  const n = xs.length;
  if (n < 20) return null;
  const m = mean(xs);
  let cum = 0;
  const dev = [];
  for (const x of xs) {
    cum += x - m;
    dev.push(cum);
  }
  const range = Math.max(...dev) - Math.min(...dev);
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / n);
  if (!s || range <= 0) return null;
  return Math.log(range / s) / Math.log(n);
}

// Percentile rank (0–100) of the latest value within its own history.
export function volPercentile(vols) {
  const v = vols.filter(Number.isFinite);
  if (v.length < 2) return null;
  const last = v.at(-1);
  return (v.filter((x) => x <= last).length / v.length) * 100;
}

// --- position sizing (Phase 4) --------------------------------------------

// Continuous Kelly fraction = mean / variance of per-period returns. Unbounded;
// callers clamp/half-Kelly for real use.
export function kellyFraction(returns) {
  const v = stdDev(returns) ** 2;
  if (returns.length < 2 || !v) return null;
  return mean(returns) / v;
}

// Vol-target weight = target annual vol % ÷ realized annual vol %. >1 means lever.
export function volTargetWeight(annualVol, target = 15) {
  if (!annualVol) return null;
  return target / annualVol;
}
