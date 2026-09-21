import { ewmaVarianceSeries, mean, quantile, rollingVol, stdDev, TRADING_DAYS } from './stats';

// Raw (unadjusted) OHLC rows; any missing / non-finite / non-positive value drops the row.
const validBars = (points) =>
  (points || []).filter((p) =>
    [p?.open, p?.high, p?.low, p?.close].every((v) => Number.isFinite(v) && v > 0)
  );

// Daily variance -> annual vol %, or null when it is not positive (odd data).
const annualize = (dailyVariance, ppy) =>
  dailyVariance > 0 ? Math.sqrt(dailyVariance * ppy) * 100 : null;

// Parkinson (1980): high/low range only.
export function parkinsonVol(points, ppy = TRADING_DAYS) {
  const rows = validBars(points);
  if (rows.length < 2) return null;
  const v = mean(rows.map((p) => Math.log(p.high / p.low) ** 2)) / (4 * Math.LN2);
  return annualize(v, ppy);
}

// Garman-Klass (1980): range plus open-to-close.
export function garmanKlassVol(points, ppy = TRADING_DAYS) {
  const rows = validBars(points);
  if (rows.length < 2) return null;
  const v = mean(
    rows.map(
      (p) =>
        0.5 * Math.log(p.high / p.low) ** 2 - (2 * Math.LN2 - 1) * Math.log(p.close / p.open) ** 2
    )
  );
  return annualize(v, ppy);
}

// Yang-Zhang (2000): overnight + open-to-close + Rogers-Satchell, robust to gaps and drift.
// The overnight and open-to-close terms are SAMPLE variances (n-1), as in the paper.
export function yangZhangVol(points, ppy = TRADING_DAYS) {
  const rows = validBars(points);
  if (rows.length < 3) return null;
  const overnight = [];
  const openClose = [];
  const rs = [];
  for (let i = 1; i < rows.length; i += 1) {
    const p = rows[i];
    overnight.push(Math.log(p.open / rows[i - 1].close));
    openClose.push(Math.log(p.close / p.open));
    rs.push(
      Math.log(p.high / p.close) * Math.log(p.high / p.open) +
        Math.log(p.low / p.close) * Math.log(p.low / p.open)
    );
  }
  const n = overnight.length;
  const k = 0.34 / (1.34 + (n + 1) / (n - 1));
  const v = stdDev(overnight) ** 2 + k * stdDev(openClose) ** 2 + (1 - k) * mean(rs);
  return annualize(v, ppy);
}

// Vol cone: distribution of rolling realized vol per window, with today's reading.
export function volCone(closes, windows = [10, 21, 63, 126, 252], ppy = TRADING_DAYS) {
  const out = [];
  for (const window of windows) {
    const series = rollingVol(closes || [], window, ppy);
    if (series.length < 2) continue;
    const sorted = [...series].sort((a, b) => a - b);
    const current = series.at(-1);
    out.push({
      window,
      min: sorted[0],
      p25: quantile(sorted, 0.25),
      median: quantile(sorted, 0.5),
      p75: quantile(sorted, 0.75),
      max: sorted.at(-1),
      current,
      percentile: (sorted.filter((v) => v <= current).length / sorted.length) * 100,
    });
  }
  return out;
}

// EWMA vol path (annual %). Shares its seeding/recursion with ewmaSigmaDaily via
// ewmaVarianceSeries, so out.at(-1) always equals ewmaVol. out[i] covers returns up
// to index seedWindow - 1 + i; zip with zipRollingToDates(out, dates, seedWindow).
export function ewmaVolSeries(returns, lambda = 0.94, seedWindow = 20, ppy = TRADING_DAYS) {
  if (returns.length < seedWindow) return [];
  return ewmaVarianceSeries(returns, lambda, seedWindow).map((v) => Math.sqrt(v * ppy) * 100);
}
