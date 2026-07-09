import { mean, stdDev, TRADING_DAYS } from './stats';

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
// ponytail: single hard-coded z (95% only). Add a z-table if other levels ship.
export function parametricVaR(returns) {
  if (returns.length < 2) return null;
  const z = 1.645;
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
