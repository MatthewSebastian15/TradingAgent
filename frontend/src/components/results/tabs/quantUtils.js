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

// Shared path-matrix summary: terminal prices, <=10 sample paths, a per-step
// p10/p50/p90 band, and terminal p10/p50/p90. Used by both MC engines.
// ponytail: stores the full paths x days matrix to compute the band. Fine at the
// capped 5000 x 126 (~5MB, a few ms); switch to online quantiles only if caps grow.
function summarizePaths(all, days, paths) {
  const terminal = all.map((p) => p[days]);
  const sortedTerminal = [...terminal].sort((a, b) => a - b);
  const band = [];
  for (let d = 0; d <= days; d += 1) {
    const col = all.map((p) => p[d]).sort((a, b) => a - b);
    band.push({ step: d, p10: QUANTILE(col, 0.1), p50: QUANTILE(col, 0.5), p90: QUANTILE(col, 0.9) });
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

// Geometric Brownian Motion Monte Carlo. mu/sigma are per-day (log) estimates.
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
  return summarizePaths(all, days, paths);
}

// Bootstrap Monte Carlo: resample actual historical daily simple returns with
// replacement (fat tails preserved) instead of drawing from a normal.
export function bootstrapMC(spot, returns, days, paths, seed) {
  if (!returns || returns.length === 0) return null;
  const rng = mulberry32(seed);
  const all = [];
  for (let p = 0; p < paths; p += 1) {
    const path = new Array(days + 1);
    path[0] = spot;
    let price = spot;
    for (let d = 1; d <= days; d += 1) {
      price *= 1 + returns[Math.floor(rng() * returns.length)];
      path[d] = price;
    }
    all.push(path);
  }
  return summarizePaths(all, days, paths);
}

// --- benchmark-relative (v2) ----------------------------------------------

// Pair two date->close series on their common trading days, in stock order.
// -> { stock:number[], market:number[] } of equal length.
export function alignByDate(stockPoints, marketPoints) {
  const byDate = new Map();
  for (const p of marketPoints || []) {
    const date = String(p?.date || '').slice(0, 10);
    const close = p?.adjusted_close ?? p?.close;
    if (date && close != null) byDate.set(date, close);
  }
  const stock = [];
  const market = [];
  for (const p of stockPoints || []) {
    const date = String(p?.date || '').slice(0, 10);
    const close = p?.adjusted_close ?? p?.close;
    if (date && close != null && byDate.has(date)) {
      stock.push(close);
      market.push(byDate.get(date));
    }
  }
  return { stock, market };
}

// Sample covariance (n-1) of two equal-length series.
function covariance(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += (xs[i] - mx) * (ys[i] - my);
  return sum / (n - 1);
}

// Beta: how much the stock moves per unit of market move. cov/var, both sample.
export function beta(stockReturns, marketReturns) {
  const cov = covariance(stockReturns, marketReturns);
  const varM = stdDev(marketReturns) ** 2;
  if (cov === null || !varM) return null;
  return cov / varM;
}

// Jensen's alpha, annualized %. rf is the per-period (daily) risk-free rate.
export function alpha(stockReturns, marketReturns, rf = 0) {
  const b = beta(stockReturns, marketReturns);
  if (b === null || stockReturns.length < 2) return null;
  const excessStock = mean(stockReturns) - rf;
  const excessMarket = mean(marketReturns) - rf;
  return (excessStock - b * excessMarket) * TRADING_DAYS * 100;
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

// --- lite backtester (Phase 4) --------------------------------------------

function smaAt(arr, w, i) {
  if (i + 1 < w) return null;
  let s = 0;
  for (let k = i - w + 1; k <= i; k += 1) s += arr[k];
  return s / w;
}

// Canned long/flat strategies on the price series. Position is decided on day i
// and earns day i+1's return (no look-ahead). No costs/slippage modeled.
// ponytail: three hard-coded strategies, long/flat only. Not a general engine.
export function backtest(closes, strategy, params = {}) {
  const n = closes.length;
  if (n < 30) return null;
  const signal = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    if (strategy === 'sma') {
      const f = smaAt(closes, params.fast || 20, i);
      const s = smaAt(closes, params.slow || 50, i);
      signal[i] = f != null && s != null && f > s ? 1 : 0;
    } else if (strategy === 'momentum') {
      const lb = params.lookback || 60;
      signal[i] = i >= lb && closes[i] > closes[i - lb] ? 1 : 0;
    } else if (strategy === 'meanrev') {
      const w = params.lookback || 20;
      const m = smaAt(closes, w, i);
      signal[i] = m != null && closes[i] < m ? 1 : 0;
    }
  }
  let eq = 1;
  let bh = 1;
  const equity = [1];
  const buyhold = [1];
  const stratRets = [];
  let wins = 0;
  let inDays = 0;
  for (let i = 1; i < n; i += 1) {
    const r = closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    bh *= 1 + r;
    const sr = signal[i - 1] * r;
    eq *= 1 + sr;
    equity.push(eq);
    buyhold.push(bh);
    stratRets.push(sr);
    if (signal[i - 1]) {
      inDays += 1;
      if (r > 0) wins += 1;
    }
  }
  const years = (n - 1) / TRADING_DAYS;
  return {
    equity,
    buyhold,
    cagr: years > 0 ? (eq ** (1 / years) - 1) * 100 : null,
    sharpe: sharpe(stratRets),
    maxDD: maxDrawdown(equity),
    winRate: inDays ? (wins / inDays) * 100 : null,
    finalReturn: (eq - 1) * 100,
    buyHoldReturn: (bh - 1) * 100,
    exposure: (inDays / (n - 1)) * 100,
  };
}

// --- correlation + optimizer (Phase 5) ------------------------------------

// Pearson correlation of two equal-length return series, in [-1, 1].
export function correlation(xs, ys) {
  const cov = covariance(xs, ys);
  const sx = stdDev(xs);
  const sy = stdDev(ys);
  if (cov === null || !sx || !sy) return null;
  return cov / (sx * sy);
}

// Correlation over a sliding window; entries can be null.
export function rollingCorrelation(xs, ys, window = 63) {
  const n = Math.min(xs.length, ys.length);
  const out = [];
  for (let end = window; end <= n; end += 1) {
    out.push(correlation(xs.slice(end - window, end), ys.slice(end - window, end)));
  }
  return out;
}

// Align N close-series on the trading days common to ALL of them.
// series: [{ symbol, points }]. -> { dates, closes: { symbol: number[] } }.
export function alignManyByDate(series) {
  if (!series || series.length === 0) return { dates: [], closes: {} };
  const maps = series.map((s) => {
    const m = new Map();
    for (const p of s.points || []) {
      const d = String(p?.date || '').slice(0, 10);
      const c = p?.adjusted_close ?? p?.close;
      if (d && c != null) m.set(d, c);
    }
    return m;
  });
  const dates = [];
  const closes = {};
  series.forEach((s) => {
    closes[s.symbol] = [];
  });
  for (const p of series[0].points || []) {
    const d = String(p?.date || '').slice(0, 10);
    if (!d || !maps.every((m) => m.has(d))) continue;
    dates.push(d);
    series.forEach((s, i) => closes[s.symbol].push(maps[i].get(d)));
  }
  return { dates, closes };
}

// NxN Pearson correlation matrix for aligned return series keyed by symbol.
export function correlationMatrix(symbols, returnsBySymbol) {
  return symbols.map((a) =>
    symbols.map((b) => (a === b ? 1 : correlation(returnsBySymbol[a], returnsBySymbol[b])))
  );
}

// KxK sample covariance matrix from a list of aligned return series.
export function covarianceMatrix(returnsList) {
  const k = returnsList.length;
  const M = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i += 1) {
    for (let j = i; j < k; j += 1) {
      const c = covariance(returnsList[i], returnsList[j]);
      M[i][j] = c ?? 0;
      M[j][i] = M[i][j];
    }
  }
  return M;
}

// Gauss-Jordan inverse of a square matrix. -> number[][] or null if singular.
// ponytail: dense O(n^3) inverse. Fine for the handful of tickers a user picks.
export function invertMatrix(A) {
  const n = A.length;
  if (n === 0 || A.some((row) => row.length !== n)) return null;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    const d = M[col][col];
    for (let j = 0; j < 2 * n; j += 1) M[col][j] /= d;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const f = M[r][col];
      for (let j = 0; j < 2 * n; j += 1) M[r][j] -= f * M[col][j];
    }
  }
  return M.map((row) => row.slice(n));
}

function matVec(A, v) {
  return A.map((row) => row.reduce((s, a, j) => s + a * v[j], 0));
}

function normalizeWeights(w) {
  const sum = w.reduce((a, b) => a + b, 0);
  if (!sum) return null;
  return w.map((x) => x / sum);
}

// Global minimum-variance weights: w ∝ Σ⁻¹·1, normalized to sum 1.
export function gmvWeights(cov) {
  const inv = invertMatrix(cov);
  if (!inv) return null;
  return normalizeWeights(matVec(inv, new Array(cov.length).fill(1)));
}

// Tangency (max-Sharpe) weights: w ∝ Σ⁻¹·(μ − rf), normalized to sum 1.
// May be negative (short) — unconstrained two-fund solution.
export function tangencyWeights(cov, mu, rf = 0) {
  const inv = invertMatrix(cov);
  if (!inv) return null;
  return normalizeWeights(matVec(inv, mu.map((m) => m - rf)));
}

// Portfolio mean/vol for weights w (per-period mu/cov).
export function portfolioStats(w, mu, cov) {
  const ret = w.reduce((s, x, i) => s + x * mu[i], 0);
  const variance = w.reduce(
    (s, x, i) => s + x * cov[i].reduce((t, c, j) => t + c * w[j], 0),
    0
  );
  return { ret, vol: Math.sqrt(Math.max(0, variance)) };
}

// Efficient frontier via two-fund separation: blend GMV and tangency portfolios.
// -> [{ vol, ret }] with vol/ret annualized to %. Empty if either fund is singular.
export function efficientFrontier(cov, mu, rf = 0, steps = 25) {
  const gmv = gmvWeights(cov);
  const tan = tangencyWeights(cov, mu, rf);
  if (!gmv || !tan) return [];
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = -0.5 + (2 * i) / steps; // -0.5 .. 1.5 mix
    const w = gmv.map((g, k) => (1 - a) * g + a * tan[k]);
    const { ret, vol } = portfolioStats(w, mu, cov);
    out.push({ vol: vol * Math.sqrt(TRADING_DAYS) * 100, ret: ret * TRADING_DAYS * 100 });
  }
  return out;
}
