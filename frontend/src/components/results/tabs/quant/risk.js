import { kurtosis, mean, skewness, stdDev, TRADING_DAYS } from './stats';

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

// One-tailed z per confidence level; unknown levels return null.
const Z_BY_ALPHA = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };

// Parametric (normal) VaR at the given confidence level (default 95%).
// sigma overrides the full-history stdDev (e.g. EWMA sigma for regime-aware VaR).
export function parametricVaR(returns, alpha = 0.95, sigma = null) {
  const z = Z_BY_ALPHA[alpha];
  if (returns.length < 2 || !z) return null;
  return (mean(returns) - z * (sigma ?? stdDev(returns))) * 100;
}

// Cornish-Fisher VaR: normal quantile adjusted for the sample's actual skew
// and fat tails. Expansion runs at the LOWER-tail quantile (z = -1.645 for
// 95%) so left skew makes VaR worse, as it should. -> signed %, or null when
// the expansion breaks down.
export function cornishFisherVaR(returns, alpha = 0.95) {
  const zAbs = Z_BY_ALPHA[alpha];
  const S = skewness(returns);
  const K = kurtosis(returns);
  if (returns.length < 4 || !zAbs || S === null || K === null) return null;
  const z = -zAbs;
  const q =
    z + ((z ** 2 - 1) * S) / 6 + ((z ** 3 - 3 * z) * K) / 24 - ((2 * z ** 3 - 5 * z) * S ** 2) / 36;
  // ponytail: CF expansion is non-monotonic on extreme moments; null is honest, cap if it fires often.
  if (!Number.isFinite(q) || q >= 0 || Math.abs(q) > 3 * zAbs) return null;
  return (mean(returns) + q * stdDev(returns)) * 100;
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
