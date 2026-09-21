import { buildYAxisTicks, formatXAxisDate } from '../../priceChartUtils';

const DAY_MS = 86_400_000;

export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  const scale = (v) => r0 + ((v - d0) / span) * (r1 - r0);
  scale.invert = (px) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  return scale;
}

export function logScale([d0, d1], [r0, r1]) {
  const inner = linearScale([Math.log(d0), Math.log(d1)], [r0, r1]);
  const scale = (v) => inner(Math.log(Math.max(v, Number.MIN_VALUE)));
  scale.invert = (px) => Math.exp(inner.invert(px));
  return scale;
}

export function extent(values) {
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return min === Infinity ? null : [min, max];
}

// Returns null when the domain is missing (e.g. extent() of an empty series).
export function paddedDomain(domain, { padRatio = 0.06, includeZero = false } = {}) {
  if (!domain) return null;
  const [min, max] = domain;
  const lo = includeZero ? Math.min(min, 0) : min;
  const hi = includeZero ? Math.max(max, 0) : max;
  const span = hi - lo;
  const pad = span > 0 ? span * padRatio : Math.abs(hi) * 0.02 || 1;
  return [lo - pad, hi + pad];
}

export function niceTicks(min, max, count = 5) {
  return buildYAxisTicks(min, max, count)
    .map((v) => Number(v.toPrecision(12)))
    .sort((a, b) => a - b);
}

// Ticks for a log axis. Returns [] when min <= 0 (log undefined) or max <= min.
// Tries 1-2-5 per decade, then 1..9 per decade, then linear nice ticks (> 0)
// so narrow ranges still get at least 3 ticks.
export function logTicks(min, max) {
  if (!(min > 0) || !(max > min)) return [];
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const collect = (mults) => {
    const ticks = [];
    for (let e = lo; e <= hi; e += 1) {
      for (const m of mults) {
        const v = Number((m * 10 ** e).toPrecision(12));
        if (v >= min && v <= max) ticks.push(v);
      }
    }
    return ticks;
  };
  let ticks = collect([1, 2, 5]);
  if (ticks.length < 3) ticks = collect([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  if (ticks.length < 3) ticks = niceTicks(min, max, 5).filter((v) => v > 0);
  return ticks;
}

export function toTime(iso) {
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? t : null;
}

export function timeToIso(t) {
  return new Date(t).toISOString().slice(0, 10);
}

export function dateTicks([t0, t1], count = 6) {
  const long = (t1 - t0) / DAY_MS > 300;
  const label = (t) =>
    long
      ? new Date(t)
          .toLocaleString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })
          .replace("'", '')
      : formatXAxisDate(timeToIso(t));
  if (!(t1 > t0) || count < 2) return [{ value: t0, label: label(t0) }];
  return Array.from({ length: count }, (_, i) => {
    const value = t0 + ((t1 - t0) * i) / (count - 1);
    return { value, label: label(value) };
  });
}

export function nearestIndex(sortedXs, x) {
  if (sortedXs.length === 0 || !Number.isFinite(x)) return -1;
  let lo = 0;
  let hi = sortedXs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (sortedXs[mid] <= x) lo = mid;
    else hi = mid;
  }
  return Math.abs(sortedXs[hi] - x) < Math.abs(sortedXs[lo] - x) ? hi : lo;
}

// Greedy vertical de-collision for point labels in pixel space.
export function layoutLabels(items, { minDx = 70, minDy = 12 } = {}) {
  const placed = [];
  return items.map((item) => {
    let labelY = item.y;
    while (placed.some((p) => Math.abs(p.x - item.x) < minDx && Math.abs(p.y - labelY) < minDy)) {
      labelY += minDy;
    }
    placed.push({ x: item.x, y: labelY });
    return { ...item, labelY };
  });
}
