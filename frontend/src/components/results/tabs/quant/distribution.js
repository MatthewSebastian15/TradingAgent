import { returnHistogram } from './benchmark';
import { mean, quantile, stdDev } from './stats';

const A = [
  -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
  2.506628277459239,
];
const B = [
  -54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572,
];
const C = [
  -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734,
  4.374664141464968, 2.938163982698783,
];
const D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const P_LOW = 0.02425;

// Inverse standard normal CDF (Acklam's rational approximation).
export function normInv(p) {
  if (!(p > 0 && p < 1)) return null;
  const tail = (q) =>
    (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5]) /
    ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1);
  if (p < P_LOW) return tail(Math.sqrt(-2 * Math.log(p)));
  if (p > 1 - P_LOW) return -tail(Math.sqrt(-2 * Math.log(1 - p)));
  const q = p - 0.5;
  const r = q * q;
  return (
    ((((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q) /
    (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1)
  );
}

export function qqPoints(returns) {
  const n = returns.length;
  const sd = stdDev(returns);
  if (n < 3 || !sd) return [];
  const m = mean(returns);
  return [...returns]
    .sort((a, b) => a - b)
    .map((v, i) => ({ x: normInv((i + 0.5) / n), y: (v - m) / sd }));
}

export function jarqueBera(returns) {
  const n = returns.length;
  if (n < 8) return null;
  const m = mean(returns);
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of returns) {
    const d = x - m;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  m2 /= n;
  m3 /= n;
  m4 /= n;
  if (!m2) return null;
  const skew = m3 / m2 ** 1.5;
  const excessKurt = m4 / (m2 * m2) - 3;
  const statistic = (n / 6) * (skew * skew + (excessKurt * excessKurt) / 4);
  const pValue = Math.exp(-statistic / 2);
  return { statistic, pValue, normalAt5: pValue >= 0.05 };
}

// Freedman-Diaconis bins on the 0.5-99.5th percentile range so one outlier
// cannot squash the shape; clipped counts are reported for the caption.
export function histogramBins(values, { clip = [0.005, 0.995], minBins = 10, maxBins = 60 } = {}) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 2) return { bins: [], clippedLow: 0, clippedHigh: 0 };
  const lo = quantile(sorted, clip[0]);
  const hi = quantile(sorted, clip[1]);
  const inRange = sorted.filter((x) => x >= lo && x <= hi);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  const width = (2 * iqr) / Math.cbrt(sorted.length);
  const raw = width > 0 && hi > lo ? Math.ceil((hi - lo) / width) : minBins;
  const count = Math.max(minBins, Math.min(maxBins, raw));
  return {
    bins: returnHistogram(inRange, count),
    clippedLow: sorted.filter((x) => x < lo).length,
    clippedHigh: sorted.filter((x) => x > hi).length,
  };
}
