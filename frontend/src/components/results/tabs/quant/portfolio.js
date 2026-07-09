import { covariance } from './benchmark';
import { stdDev, TRADING_DAYS } from './stats';

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
  return normalizeWeights(
    matVec(
      inv,
      mu.map((m) => m - rf)
    )
  );
}

// Portfolio mean/vol for weights w (per-period mu/cov).
export function portfolioStats(w, mu, cov) {
  const ret = w.reduce((s, x, i) => s + x * mu[i], 0);
  const variance = w.reduce((s, x, i) => s + x * cov[i].reduce((t, c, j) => t + c * w[j], 0), 0);
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

// Standard normal CDF via Abramowitz-Stegun 7.1.26 (|error| < 7.5e-8). JS has no
// built-in erf/normCDF, and this is the only piece Black-Scholes is missing.
