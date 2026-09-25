import { beta } from './benchmark';
import { normInv } from './distribution';
import { sharpe } from './risk';
import { maxDrawdown, mean, percentileRank, stdDev, TRADING_DAYS } from './stats';

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
export function rollingSharpe(returns, window = 63, rf = 0, ppy = TRADING_DAYS) {
  const out = [];
  for (let end = window; end <= returns.length; end += 1) {
    out.push(sharpe(returns.slice(end - window, end), rf, ppy));
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

// Rolling stats over returns: output i covers returns [i, i+window), whose last
// return ends on close index window + i.
export function zipRollingToDates(values, dates, window) {
  const out = [];
  values.forEach((value, i) => {
    const date = dates[window + i];
    if (date && Number.isFinite(value)) out.push({ date: String(date), value });
  });
  return out;
}

// Calmar: CAGR ÷ |max drawdown|. null if no history or no drawdown.
export function calmar(closes, ppy = TRADING_DAYS) {
  const n = closes.length;
  if (n < 2 || !closes[0]) return null;
  const years = (n - 1) / ppy;
  if (years <= 0) return null;
  const cagr = (closes.at(-1) / closes[0]) ** (1 / years) - 1;
  const dd = maxDrawdown(closes) / 100;
  if (dd === 0) return null;
  return cagr / Math.abs(dd);
}

// --- regime / persistence (Phase 4) ---------------------------------------

// Ornstein-Uhlenbeck half-life from AR(1) on log prices: OLS of dlogP on lagged
// logP, theta = -slope, halfLife = ln(2)/theta. -> days, or null if not
// mean-reverting or outside [1, 252] (the estimate is noise out there).
// ponytail: OLS point estimate, no confidence interval. Add stderr if users act on it.
export function ouHalfLife(closes) {
  const n = closes.length;
  if (n < 20 || closes.some((c) => !(c > 0))) return null;
  const logs = closes.map(Math.log);
  const x = logs.slice(0, -1);
  const y = x.map((xi, i) => logs[i + 1] - xi);
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < x.length; i += 1) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
  }
  if (!sxx) return null;
  const theta = -(sxy / sxx);
  if (theta <= 0) return null;
  const halfLife = Math.LN2 / theta;
  return halfLife >= 1 && halfLife <= 252 ? halfLife : null;
}

// Percentile rank (0–100) of the latest value within its own history.
export function volPercentile(vols) {
  const v = vols.filter(Number.isFinite);
  if (v.length < 2) return null;
  return percentileRank(v, v.at(-1));
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

// Half-Kelly (clamped to [0, 1] first) capped by the vol-target weight. Fraction of capital.
export function suggestedPosition(kelly, volWeight) {
  if (!Number.isFinite(kelly)) return null;
  const halfKelly = Math.max(0, Math.min(1, kelly)) / 2;
  return Number.isFinite(volWeight) ? Math.min(halfKelly, volWeight) : halfKelly;
}

// Excess-return Kelly with a one-sided confidence bound on the mean. The point
// estimate of daily mean return is so noisy that full Kelly routinely says 300%+;
// sizing off the lower bound is the defensible default.
export function kellyEstimate(returns, rfDaily = 0, level = 0.95) {
  const n = returns.length;
  if (n < 20) return null;
  const excess = returns.map((r) => r - rfDaily);
  const m = mean(excess);
  const v = stdDev(excess) ** 2;
  if (!v) return null;
  const standardError = Math.sqrt(v / n);
  return {
    full: m / v,
    lowerBound: (m - normInv(level) * standardError) / v,
    standardError,
  };
}
