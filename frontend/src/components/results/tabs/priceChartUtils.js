export const UP_COLOR = '#00c853';
export const DOWN_COLOR = '#ff3b30';
export const NEUTRAL_COLOR = '#8a8f98';
export const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
export const AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
export const TEXT_COLOR = '#8a8f98';
export const CROSSHAIR_COLOR = 'rgba(255, 255, 255, 0.35)';
export const LAST_PRICE_COLOR = 'rgba(255, 153, 0, 0.85)';

export function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function formatCompactNumber(value) {
  const number = toNumber(value);
  if (number === null) return 'N/A';

  if (Math.abs(number) >= 1_000_000_000) {
    return `${(number / 1_000_000_000).toFixed(1)}B`;
  }

  if (Math.abs(number) >= 1_000_000) {
    return `${(number / 1_000_000).toFixed(1)}M`;
  }

  if (Math.abs(number) >= 1_000) {
    return `${(number / 1_000).toFixed(1)}K`;
  }

  return String(Math.round(number));
}

export function formatXAxisDate(date) {
  if (!date) return '';
  const text = String(date);
  return text.length >= 10 ? text.slice(5, 10) : text;
}

export function normalizePricePoint(point) {
  if (!point || !point.date) return null;

  const open = toNumber(point.open);
  const high = toNumber(point.high);
  const low = toNumber(point.low);
  const close = toNumber(point.close);

  if ([open, high, low, close].some((value) => value === null)) return null;

  const volume = toNumber(point.volume);
  const adjustedClose = toNumber(point.adjusted_close);

  return {
    ...point,
    date: String(point.date),
    open,
    high: Math.max(high, open, close, low),
    low: Math.min(low, open, close, high),
    close,
    adjusted_close: adjustedClose !== null ? adjustedClose : close,
    volume: volume !== null && volume >= 0 ? volume : null,
  };
}

export function normalizePricePoints(points) {
  if (!Array.isArray(points)) return [];

  return points
    .map(normalizePricePoint)
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function buildXAxisTicks(points) {
  if (!Array.isArray(points) || points.length === 0) return [];

  const lastIndex = points.length - 1;
  const targetTickCount = points.length <= 60 ? 6 : points.length <= 90 ? 7 : 8;
  const interval = Math.max(1, Math.floor(lastIndex / Math.max(targetTickCount - 1, 1)));
  const indexes = new Set([0, lastIndex]);

  for (let index = 0; index <= lastIndex; index += interval) {
    indexes.add(index);
  }

  return Array.from(indexes)
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      date: points[index]?.date,
      label: formatXAxisDate(points[index]?.date),
    }))
    .filter((item) => item.date);
}

export function getNiceStep(range, targetTickCount = 5) {
  if (!Number.isFinite(range) || range <= 0) return 1;

  const rawStep = range / Math.max(targetTickCount - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function buildYAxisTicks(minValue, maxValue, targetTickCount = 6) {
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return [];
  if (minValue === maxValue) return [minValue];

  const range = maxValue - minValue;
  const step = getNiceStep(range, targetTickCount);
  const start = Math.floor(minValue / step) * step;
  const end = Math.ceil(maxValue / step) * step;
  const ticks = [];

  for (let value = start; value <= end + step * 0.5; value += step) {
    ticks.push(value);
  }

  return ticks.reverse();
}

export function isUpCandle(point, previousPoint = null) {
  const reference = previousPoint?.close ?? point.open;
  return point.close >= reference;
}

export function movementColor(point, previousPoint = null) {
  const reference = previousPoint?.close ?? point.open;
  if (point.close > reference) return UP_COLOR;
  if (point.close < reference) return DOWN_COLOR;
  return NEUTRAL_COLOR;
}

export function movementLabel(point, previousPoint = null) {
  const reference = previousPoint?.close ?? point.open;
  if (point.close > reference) return 'UP';
  if (point.close < reference) return 'DOWN';
  return 'FLAT';
}
