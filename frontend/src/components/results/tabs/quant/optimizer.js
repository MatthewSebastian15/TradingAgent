import { portfolioStats } from './portfolio';
import { mean } from './stats';

// Ledoit-Wolf (2004) shrinkage toward a scaled identity. Input: one return series per asset.
export function ledoitWolf(returnsList) {
  const p = returnsList.length;
  if (p === 0) return null;
  const T = Math.min(...returnsList.map((r) => r.length));
  if (T < 3) return null;
  const X = returnsList.map((r) => {
    const s = r.slice(0, T);
    const m = mean(s);
    return s.map((v) => v - m);
  });
  const S = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => {
      let acc = 0;
      for (let t = 0; t < T; t += 1) acc += X[i][t] * X[j][t];
      return acc / T;
    })
  );
  const mu = S.reduce((a, row, i) => a + row[i], 0) / p;
  let d2 = 0;
  for (let i = 0; i < p; i += 1) {
    for (let j = 0; j < p; j += 1) d2 += (S[i][j] - (i === j ? mu : 0)) ** 2;
  }
  d2 /= p;
  let bBar = 0;
  for (let t = 0; t < T; t += 1) {
    let acc = 0;
    for (let i = 0; i < p; i += 1) {
      for (let j = 0; j < p; j += 1) acc += (X[i][t] * X[j][t] - S[i][j]) ** 2;
    }
    bBar += acc / p;
  }
  bBar /= T * T;
  const shrinkage = d2 > 0 ? Math.min(bBar, d2) / d2 : 1;
  const matrix = S.map((row, i) =>
    row.map((v, j) => shrinkage * (i === j ? mu : 0) + (1 - shrinkage) * v)
  );
  return { matrix, shrinkage };
}

export function projectCappedSimplex(v, cap = 1) {
  const c = Math.max(cap, 1 / v.length);
  const clip = (x) => Math.min(c, Math.max(0, x));
  let lo = Math.min(...v) - c;
  let hi = Math.max(...v);
  for (let it = 0; it < 100; it += 1) {
    const tau = (lo + hi) / 2;
    const sum = v.reduce((a, x) => a + clip(x - tau), 0);
    if (sum > 1) lo = tau;
    else hi = tau;
  }
  const tau = (lo + hi) / 2;
  return v.map((x) => clip(x - tau));
}

const matVec = (A, w) => A.map((row) => row.reduce((s, a, j) => s + a * w[j], 0));

// Projected gradient descent on w'Σw. Step 1/(2·trace Σ) is always stable (trace ≥ λmax).
export function minVarianceLongOnly(cov, cap = 1, iterations = 3000) {
  const p = cov.length;
  const trace = cov.reduce((a, row, i) => a + row[i], 0);
  if (p === 0 || !(trace > 0)) return null;
  const step = 1 / (2 * trace);
  let w = new Array(p).fill(1 / p);
  for (let it = 0; it < iterations; it += 1) {
    const g = matVec(cov, w).map((x) => 2 * x);
    w = projectCappedSimplex(
      w.map((x, i) => x - step * g[i]),
      cap
    );
  }
  return w;
}

// Projected gradient ascent on the Sharpe ratio (quasi-concave on the simplex); keeps the best iterate.
export function maxSharpeLongOnly(cov, mu, rf = 0, cap = 1, iterations = 3000) {
  const p = cov.length;
  if (p === 0) return null;
  const sharpeOf = (w) => {
    const { ret, vol } = portfolioStats(w, mu, cov);
    return vol > 0 ? (ret - rf) / vol : -Infinity;
  };
  let w = projectCappedSimplex(new Array(p).fill(1 / p), cap);
  let best = w;
  let bestSharpe = sharpeOf(w);
  for (let it = 0; it < iterations; it += 1) {
    const { ret, vol } = portfolioStats(w, mu, cov);
    if (!(vol > 0)) break;
    const sw = matVec(cov, w);
    const grad = mu.map((m, i) => (m * vol - ((ret - rf) * sw[i]) / vol) / (vol * vol));
    const scale = Math.max(...grad.map(Math.abs));
    if (!(scale > 0)) break;
    const eta = 0.05 / (1 + it / 300);
    w = projectCappedSimplex(
      w.map((x, i) => x + (eta * grad[i]) / scale),
      cap
    );
    const s = sharpeOf(w);
    if (s > bestSharpe) {
      bestSharpe = s;
      best = w;
    }
  }
  return { weights: best, sharpe: bestSharpe, negativeExcess: mu.every((m) => m <= rf) };
}

export function riskParity(cov, iterations = 500) {
  const p = cov.length;
  if (p === 0 || cov.some((row, i) => !(row[i] > 0))) return null;
  const normalize = (w) => {
    const s = w.reduce((a, b) => a + b, 0);
    return w.map((x) => x / s);
  };
  let w = normalize(cov.map((row, i) => 1 / Math.sqrt(row[i])));
  for (let it = 0; it < iterations; it += 1) {
    const sw = matVec(cov, w);
    const rc = w.map((x, i) => x * sw[i]);
    const total = rc.reduce((a, b) => a + b, 0);
    const target = total / p;
    if (Math.max(...rc.map((r) => Math.abs(r - target))) / total < 1e-10) break;
    w = normalize(w.map((x, i) => (rc[i] > 0 ? x * Math.sqrt(target / rc[i]) : x)));
  }
  return w;
}

function mondayKey(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Weekly closes reduce the bias from exchanges closing at different times.
export function resampleWeekly(dates, closesBySymbol) {
  const index = [];
  dates.forEach((date, i) => {
    const key = mondayKey(date);
    if (index.length && index.at(-1).key === key) index.at(-1).i = i;
    else index.push({ key, i });
  });
  const closes = {};
  for (const [symbol, values] of Object.entries(closesBySymbol)) {
    closes[symbol] = index.map((e) => values[e.i]);
  }
  return { dates: index.map((e) => dates[e.i]), closes };
}
