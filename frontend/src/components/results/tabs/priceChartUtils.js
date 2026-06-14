export const UP_COLOR = '#00c853';
export const DOWN_COLOR = '#ff3b30';
export const NEUTRAL_COLOR = '#8a8f98';
export const GRID_COLOR = 'rgba(255, 255, 255, 0.08)';
export const AXIS_COLOR = 'rgba(255, 255, 255, 0.18)';
export const TEXT_COLOR = '#8a8f98';
export const CROSSHAIR_COLOR = 'rgba(255, 255, 255, 0.35)';
export const LAST_PRICE_COLOR = 'rgba(255, 153, 0, 0.85)';
export const MIN_RANGE_DAYS = 7;
export const PRICE_RANGE_OPTIONS = [
  { key: 'YTD', label: 'YTD' },
  { key: '1Y', label: '1Y', days: 365 },
  { key: '6M', label: '6M', days: 183 },
  { key: '3M', label: '3M', days: 92 },
  { key: '1M', label: '1M', days: 31 },
  { key: '1W', label: '1W', days: MIN_RANGE_DAYS },
];
export const DEFAULT_PRICE_RANGE = '1Y';

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
  if (text.length >= 16 && (text.includes(':') || text.includes('T'))) {
    return `${text.slice(5, 10)} ${text.slice(11, 16)}`;
  }
  return text.length >= 10 ? text.slice(5, 10) : text;
}

export function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function subtractOneYearIsoDate(dateValue) {
  if (!isIsoDate(dateValue)) return null;
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const targetYear = year - 1;
  const safeDay = Math.min(day, daysInMonth(targetYear, month));
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function firstIsoDate(...values) {
  return values.find((value) => isIsoDate(value)) || null;
}

function lastPointOnOrBefore(points, dateValue) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!isIsoDate(dateValue)) return points.at(-1) || null;
  return points.filter((point) => point.date <= dateValue).at(-1) || null;
}

export function resolveYoyPriceWindow(chart = {}, points = []) {
  const normalizedPoints = normalizePricePoints(points);
  const requestedTradeDate = firstIsoDate(
    chart.requested_trade_date,
    chart.trade_date,
    chart.analysis_trade_date,
    chart.end_date
  );
  const latestPointAtOrBeforeRequest = lastPointOnOrBefore(normalizedPoints, requestedTradeDate);
  const metadataEndDate = firstIsoDate(
    chart.effective_trade_date,
    chart.price_as_of_date,
    chart.last_trade_date,
    chart.last_available_trade_date,
    chart.end_date
  );
  const endDate = latestPointAtOrBeforeRequest?.date || metadataEndDate || requestedTradeDate;
  const startDate =
    subtractOneYearIsoDate(endDate) || firstIsoDate(chart.start_date) || normalizedPoints[0]?.date;
  const windowPoints =
    startDate && endDate
      ? normalizedPoints.filter((point) => point.date >= startDate && point.date <= endDate)
      : normalizedPoints;

  return {
    requestedTradeDate,
    startDate,
    endDate,
    points: windowPoints,
    fallbackToLastTrade:
      Boolean(requestedTradeDate && endDate && requestedTradeDate !== endDate) ||
      Boolean(chart.fallback_to_last_trade),
  };
}

export function parsePointDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

export function daysBetween(startDate, endDate) {
  const start = parsePointDate(startDate);
  const end = parsePointDate(endDate);
  if (!start || !end) return MIN_RANGE_DAYS;
  return Math.max(MIN_RANGE_DAYS, Math.round((end - start) / 86_400_000));
}

export function rangeStartIsoDate(rangeKey, endDateValue) {
  const endDate = parsePointDate(endDateValue);
  if (!endDate) return null;
  if (rangeKey === 'YTD') {
    return `${endDate.getUTCFullYear()}-01-01`;
  }
  const range = PRICE_RANGE_OPTIONS.find((option) => option.key === rangeKey);
  const days = range?.days ?? 365;
  return toIsoDate(new Date(endDate.getTime() - days * 86_400_000));
}

export function filterPricePointsByRange(points, rangeKey) {
  const normalizedPoints = normalizePricePoints(points);
  if (normalizedPoints.length < 2) return normalizedPoints;

  const endPoint = normalizedPoints.at(-1);
  const endIso = String(endPoint.date).slice(0, 10);
  const startIso = rangeStartIsoDate(rangeKey, endIso);
  if (!startIso) return normalizedPoints;

  const filtered = normalizedPoints.filter((point) => {
    const pointDate = String(point.date).slice(0, 10);
    return pointDate >= startIso && pointDate <= endIso;
  });
  return filtered.length >= 2 ? filtered : normalizedPoints.slice(-2);
}

export function rangeNeedsDetailFetch(rangeKey) {
  return rangeKey === '1W' || rangeKey === '1M';
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

export function buildHistoricalMarketCapPoints(points, sharesOutstanding) {
  const shares = toNumber(sharesOutstanding);
  if (shares === null || shares <= 0) return [];

  return normalizePricePoints(points).map((point) => ({
    date: point.date,
    value: Number((point.close * shares).toFixed(2)),
  }));
}

export function buildMaxDrawdownPoints(points) {
  const normalizedPoints = normalizePricePoints(points);
  if (normalizedPoints.length < 2) return [];

  let peak = normalizedPoints[0].close;
  return normalizedPoints.map((point) => {
    if (point.close > peak) peak = point.close;
    const drawdown = peak ? ((point.close - peak) / peak) * 100 : 0;
    return {
      date: point.date,
      value: Number(drawdown.toFixed(2)),
    };
  });
}

export function movementLabel(point, previousPoint = null) {
  const reference = previousPoint?.close ?? point.open;
  if (point.close > reference) return 'UP';
  if (point.close < reference) return 'DOWN';
  return 'FLAT';
}
