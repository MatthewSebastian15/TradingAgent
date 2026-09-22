import { garchForecast } from './garch';
import { mean, TRADING_DAYS } from './stats';

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

// Arithmetic daily drift for monteCarloGBM, which applies the −σ²/2 Itô term itself.
// Historical: mean log return already contains −σ²/2, so add it back once.
// Risk-neutral: the daily risk-free rate is already arithmetic.
export function simulationDrift({ mode, logReturns, sigma, rfDaily = 0 }) {
  if (mode === 'riskneutral') return rfDaily;
  if (!logReturns || logReturns.length === 0) return 0;
  return mean(logReturns) + 0.5 * sigma * sigma;
}

// Average EWMA weight over the horizon: today's vol dominates short horizons and
// fades toward the long-run level as the horizon grows.
export function blendSigma(ewmaSigma, longRunSigma, days, lambda = 0.94) {
  if (!Number.isFinite(ewmaSigma)) return longRunSigma;
  if (!Number.isFinite(longRunSigma) || days <= 1) return ewmaSigma;
  const w = (1 - lambda ** days) / (days * (1 - lambda));
  return Math.sqrt(w * ewmaSigma ** 2 + (1 - w) * longRunSigma ** 2);
}

export function horizonSigma({ garchFit = null, ewmaSigma, longRunSigma, days }) {
  if (garchFit) return { sigma: garchForecast(garchFit, days).dailySigma, source: 'garch' };
  return { sigma: blendSigma(ewmaSigma, longRunSigma, days), source: 'blend' };
}

export const QUANTILE = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

const PCTS = [
  ['p5', 0.05],
  ['p10', 0.1],
  ['p25', 0.25],
  ['p50', 0.5],
  ['p75', 0.75],
  ['p90', 0.9],
  ['p95', 0.95],
];

// Shared path-matrix summary: terminal prices, <=10 sample paths, a per-step
// p5-p95 band, terminal p5-p95, touch probabilities and per-path max drawdown.
// ponytail: stores the full paths x days matrix for per-step bands. Fine at the
// capped 5000 x 252 inside a worker; switch to online quantiles only if caps grow.
function summarizePaths(all, days, paths, spot, { target = null, stop = null } = {}) {
  const terminal = all.map((p) => p[days]);
  const sortedTerminal = [...terminal].sort((a, b) => a - b);
  const band = [];
  for (let d = 0; d <= days; d += 1) {
    const col = all.map((p) => p[d]).sort((a, b) => a - b);
    const row = { step: d };
    for (const [key, q] of PCTS) row[key] = QUANTILE(col, q);
    band.push(row);
  }

  let hitTarget = 0;
  let hitStop = 0;
  const drawdowns = [];
  for (const path of all) {
    let peak = path[0];
    let worst = 0;
    let max = path[0];
    let min = path[0];
    for (let d = 1; d <= days; d += 1) {
      const v = path[d];
      if (v > peak) peak = v;
      else worst = Math.min(worst, v / peak - 1);
      if (v > max) max = v;
      if (v < min) min = v;
    }
    if (Number.isFinite(target) && max >= target) hitTarget += 1;
    if (Number.isFinite(stop) && min <= stop) hitStop += 1;
    drawdowns.push(worst * 100);
  }
  drawdowns.sort((a, b) => a - b);

  const percentiles = {};
  for (const [key, q] of PCTS) percentiles[key] = QUANTILE(sortedTerminal, q);
  return {
    terminal,
    samplePaths: all.slice(0, Math.min(10, paths)),
    band,
    percentiles,
    probBelowSpot: terminal.filter((v) => v < spot).length / terminal.length,
    probTarget: Number.isFinite(target) ? hitTarget / all.length : null,
    probStop: Number.isFinite(stop) ? hitStop / all.length : null,
    expectedReturnPct: (mean(terminal) / spot - 1) * 100,
    maxDrawdownMedian: QUANTILE(drawdowns, 0.5),
    maxDrawdownWorst10: QUANTILE(drawdowns, 0.1),
  };
}

// Geometric Brownian Motion Monte Carlo. mu/sigma are per-day (log) estimates.
export function monteCarloGBM(spot, mu, sigma, days, paths, seed, options = {}) {
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
  return summarizePaths(all, days, paths, spot, options);
}

const DAY_MS = 86_400_000;

export function futureTradingDates(lastIso, days, ppy = TRADING_DAYS) {
  let t = Date.parse(`${String(lastIso).slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(t)) return [];
  const out = [];
  while (out.length < days) {
    t += DAY_MS;
    const day = new Date(t).getUTCDay();
    if (ppy === 365 || (day !== 0 && day !== 6)) out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// Single entry point shared by the worker and the synchronous fallback.
export function runMonteCarlo({ method, args }) {
  return method === 'bootstrap' ? bootstrapMC(...args) : monteCarloGBM(...args);
}

// Bootstrap Monte Carlo: resample actual historical daily simple returns with
// replacement (fat tails preserved) instead of drawing from a normal. Block bootstrap
// samples contiguous blocks of returns to preserve volatility clustering.
// demean removes the sample drift so a bull-run window does not become the forecast;
// drift then adds a chosen daily drift back (e.g. 0 or the risk-free rate).
export function bootstrapMC(spot, returns, days, paths, seed, blockSize = 5, options = {}) {
  if (!returns || returns.length === 0) return null;
  const { demean = false, drift = 0 } = options;
  const m = demean ? mean(returns) : 0;
  const pool = demean ? returns.map((r) => r - m + drift) : returns;
  const rng = mulberry32(seed);
  const all = [];
  for (let p = 0; p < paths; p += 1) {
    const path = new Array(days + 1);
    path[0] = spot;
    let price = spot;
    for (let d = 1; d <= days; ) {
      const start = Math.floor(rng() * pool.length);
      for (let b = 0; b < blockSize && d <= days; b += 1, d += 1) {
        price *= 1 + pool[(start + b) % pool.length]; // ponytail: circular wrap = stationary bootstrap approx.
        path[d] = price;
      }
    }
    all.push(path);
  }
  return summarizePaths(all, days, paths, spot, options);
}
