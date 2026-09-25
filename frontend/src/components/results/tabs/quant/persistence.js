import { invertMatrix } from './portfolio';
import { mean } from './stats';

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lgamma(x) {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < LANCZOS.length; i += 1) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

// Expected R/S of i.i.d. noise for a window of n (Anis-Lloyd with Peters' correction).
export function anisLloydExpectedRS(n) {
  let sum = 0;
  for (let i = 1; i < n; i += 1) sum += Math.sqrt((n - i) / i);
  const front =
    n <= 340
      ? Math.exp(lgamma((n - 1) / 2) - lgamma(n / 2)) / Math.sqrt(Math.PI)
      : 1 / Math.sqrt((n * Math.PI) / 2);
  return ((n - 0.5) / n) * front * sum;
}

function rescaledRange(chunk) {
  const m = mean(chunk);
  let cum = 0;
  let lo = 0;
  let hi = 0;
  let ss = 0;
  for (const x of chunk) {
    const d = x - m;
    cum += d;
    if (cum < lo) lo = cum;
    if (cum > hi) hi = cum;
    ss += d * d;
  }
  const s = Math.sqrt(ss / chunk.length);
  return s > 0 ? (hi - lo) / s : null;
}

export function hurstExponent(returns, { minWindow = 8 } = {}) {
  const n = returns.length;
  if (n < 64) return null;
  const xs = [];
  const ys = [];
  for (let size = minWindow; size <= Math.floor(n / 2); size *= 2) {
    const values = [];
    for (let start = 0; start + size <= n; start += size) {
      const rs = rescaledRange(returns.slice(start, start + size));
      if (rs !== null) values.push(rs);
    }
    if (values.length === 0) continue;
    xs.push(Math.log(size));
    ys.push(Math.log(mean(values)) - Math.log(anisLloydExpectedRS(size)));
  }
  const k = xs.length;
  if (k < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < k; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < k; i += 1) sse += (ys[i] - my - slope * (xs[i] - mx)) ** 2;
  const standardError = Math.sqrt(sse / (k - 2) / sxx);
  return {
    hurst: 0.5 + slope,
    standardError,
    significant: Math.abs(slope) > 2 * standardError,
    windows: k,
  };
}

const ADF_CRITICAL = { '1%': -3.43, '5%': -2.86, '10%': -2.57 };

// Augmented Dickey-Fuller: Δy_t = a + γ·y_{t−1} + Σ φ_j Δy_{t−j} + e. γ's t-stat below the
// 5% MacKinnon critical value rejects a unit root (the series mean-reverts).
export function adfTest(series, lags = 1) {
  const y = series.filter(Number.isFinite);
  if (y.length < 30 + lags) return null;
  const dy = [];
  for (let i = 1; i < y.length; i += 1) dy.push(y[i] - y[i - 1]);
  const X = [];
  const Y = [];
  for (let t = lags; t < dy.length; t += 1) {
    const row = [1, y[t]];
    for (let j = 1; j <= lags; j += 1) row.push(dy[t - j]);
    X.push(row);
    Y.push(dy[t]);
  }
  const k = 2 + lags;
  const m = X.length;
  const xtx = Array.from({ length: k }, () => new Array(k).fill(0));
  const xty = new Array(k).fill(0);
  for (let r = 0; r < m; r += 1) {
    for (let i = 0; i < k; i += 1) {
      xty[i] += X[r][i] * Y[r];
      for (let j = 0; j < k; j += 1) xtx[i][j] += X[r][i] * X[r][j];
    }
  }
  const inv = invertMatrix(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  let sse = 0;
  for (let r = 0; r < m; r += 1) {
    const fit = X[r].reduce((s, v, i) => s + v * beta[i], 0);
    sse += (Y[r] - fit) ** 2;
  }
  const se = Math.sqrt((sse / (m - k)) * inv[1][1]);
  if (!(se > 0)) return null;
  const tStat = beta[1] / se;
  return {
    tStat,
    gamma: beta[1],
    lags,
    observations: m,
    critical: ADF_CRITICAL,
    stationaryAt5: tStat < ADF_CRITICAL['5%'],
  };
}
