// Data-quality report for a daily OHLCV series. Pure; the headline renders `issues`.
const MS_PER_DAY = 86_400_000;

// Single source of truth for a row's price: finite positive adjusted_close, else finite positive
// close, else null (zero/negative prices are bad data and drop the row). The quality report and
// the panel's derived series both use it so they cannot disagree.
const usable = (v) => Number.isFinite(v) && v > 0;
export const pointPrice = (p) => {
  if (usable(p?.adjusted_close)) return p.adjusted_close;
  return usable(p?.close) ? p.close : null;
};

// Dated rows with a usable price; closes/dates derived from these stay aligned.
export const priceRows = (points) =>
  (Array.isArray(points) ? points : []).filter((p) => p && p.date && pointPrice(p) !== null);

const isoTime = (iso) => Date.parse(`${iso}T00:00:00Z`);

export function assessSeries(
  points,
  { minObservations = 126, staleRun = 5, extremeMove = 0.4, gapDays = 7 } = {}
) {
  const rows = priceRows(points);
  const dates = rows.map((p) => String(p.date).slice(0, 10));
  const closes = rows.map(pointPrice);
  const issues = [];

  if (rows.length < minObservations) {
    issues.push({
      code: 'short_history',
      count: rows.length,
      dates: [],
      message: `Only ${rows.length} observations; estimates below ${minObservations} are noisy.`,
    });
  }

  const nonPositive = (Array.isArray(points) ? points : [])
    .filter(
      (p) =>
        p &&
        p.date &&
        pointPrice(p) === null &&
        [p.adjusted_close, p.close].some((v) => Number.isFinite(v) && v <= 0)
    )
    .map((p) => String(p.date).slice(0, 10));
  if (nonPositive.length > 0) {
    issues.push({
      code: 'non_positive_price',
      count: nonPositive.length,
      dates: nonPositive,
      message: `${nonPositive.length} row(s) with a zero or negative price were ignored.`,
    });
  }

  const staleDates = [];
  let run = 1;
  for (let i = 1; i < closes.length; i += 1) {
    run = closes[i] === closes[i - 1] ? run + 1 : 1;
    if (run === staleRun) staleDates.push(dates[i]);
  }
  if (staleDates.length > 0) {
    issues.push({
      code: 'stale_prices',
      count: staleDates.length,
      dates: staleDates,
      message: `${staleDates.length} stretch(es) of ${staleRun}+ identical closes (halt or stale feed).`,
    });
  }

  const zeroVolume = rows.filter((p) => p.volume === 0).map((p) => String(p.date).slice(0, 10));
  if (zeroVolume.length > 0) {
    issues.push({
      code: 'zero_volume',
      count: zeroVolume.length,
      dates: zeroVolume,
      message: `${zeroVolume.length} day(s) with zero volume.`,
    });
  }

  const extreme = [];
  const gaps = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    if (prev > 0 && Math.abs(closes[i] / prev - 1) > extremeMove) extreme.push(dates[i]);
    if ((isoTime(dates[i]) - isoTime(dates[i - 1])) / MS_PER_DAY > gapDays) gaps.push(dates[i]);
  }
  if (extreme.length > 0) {
    issues.push({
      code: 'extreme_move',
      count: extreme.length,
      dates: extreme,
      message: `${extreme.length} daily move(s) beyond ±${Number((extremeMove * 100).toFixed(2))}% (possible unadjusted split).`,
    });
  }
  if (gaps.length > 0) {
    issues.push({
      code: 'calendar_gap',
      count: gaps.length,
      dates: gaps,
      message: `${gaps.length} gap(s) longer than ${gapDays} calendar days (suspension or missing data).`,
    });
  }

  return {
    observations: rows.length,
    startDate: dates[0] ?? null,
    endDate: dates.at(-1) ?? null,
    issues,
  };
}
