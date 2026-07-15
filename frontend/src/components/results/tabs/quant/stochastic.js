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

export const QUANTILE = (sorted, p) =>
  sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];

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
    band.push({
      step: d,
      p10: QUANTILE(col, 0.1),
      p50: QUANTILE(col, 0.5),
      p90: QUANTILE(col, 0.9),
    });
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
// replacement (fat tails preserved) instead of drawing from a normal. Block bootstrap
// samples contiguous blocks of returns to preserve volatility clustering.
export function bootstrapMC(spot, returns, days, paths, seed, blockSize = 5) {
  if (!returns || returns.length === 0) return null;
  const rng = mulberry32(seed);
  const all = [];
  for (let p = 0; p < paths; p += 1) {
    const path = new Array(days + 1);
    path[0] = spot;
    let price = spot;
    for (let d = 1; d <= days; ) {
      const start = Math.floor(rng() * returns.length);
      for (let b = 0; b < blockSize && d <= days; b += 1, d += 1) {
        price *= 1 + returns[(start + b) % returns.length]; // ponytail: circular wrap = stationary bootstrap approx.
        path[d] = price;
      }
    }
    all.push(path);
  }
  return summarizePaths(all, days, paths);
}
