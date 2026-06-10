import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
import { getFieldQuality } from '../../../utils/dataStatus';
import CandlestickPriceChart from './CandlestickPriceChart';
import { formatCompactNumber, resolveYoyPriceWindow } from './priceChartUtils';

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function formatPercent(value) {
  const number = Number(value);
  if (!hasValue(value) || !Number.isFinite(number)) return 'N/A';
  return `${number.toFixed(2)}%`;
}

function unwrapValue(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value.value ?? value.normalized_value ?? null;
  }
  return value;
}

function displayPrice(value, ticker) {
  return formatPrice(unwrapValue(value), ticker) || 'N/A';
}

const EMPTY_PRICE_CHART = {};
const MIN_ZOOM_DAYS = 7;

const PRICE_RANGE_OPTIONS = [
  { key: '1Y', label: '1Y', days: 365 },
  { key: '6M', label: '6M', days: 183 },
  { key: '3M', label: '3M', days: 92 },
  { key: '1M', label: '1M', days: 31 },
  { key: '1W', label: '1W', days: MIN_ZOOM_DAYS },
];

function parseIsoDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(startDate, endDate) {
  const start = parseIsoDate(startDate);
  const end = parseIsoDate(endDate);
  if (!start || !end) return MIN_ZOOM_DAYS;
  return Math.max(MIN_ZOOM_DAYS, Math.round((end - start) / 86_400_000));
}

function clampZoomDays(days, maxDays) {
  return Math.max(MIN_ZOOM_DAYS, Math.min(Math.round(days), maxDays));
}

function filterPointsByDays(points, days) {
  if (!Array.isArray(points) || points.length < 2) return points || [];

  const endPoint = points.at(-1);
  const endDate = parseIsoDate(endPoint?.date);
  if (!endDate) return points;

  const startDate = new Date(endDate.getTime() - days * 86_400_000);
  const startIso = toIsoDate(startDate);
  const filtered = points.filter((point) => point.date >= startIso && point.date <= endPoint.date);

  return filtered.length >= 2 ? filtered : points.slice(-2);
}

function activeRangeKey(days, maxDays) {
  if (days >= maxDays) return '1Y';
  const match = PRICE_RANGE_OPTIONS.find((option) => Math.abs(option.days - days) <= 1);
  return match?.key || null;
}

export default function ChartPriceTab({ result }) {
  const [zoomDays, setZoomDays] = useState(365);
  const chart = result?.price_chart || EMPTY_PRICE_CHART;
  const yoyWindow = useMemo(() => resolveYoyPriceWindow(chart, chart.points), [chart]);
  const maxZoomDays = useMemo(
    () => Math.min(365, daysBetween(yoyWindow.points[0]?.date, yoyWindow.points.at(-1)?.date)),
    [yoyWindow.points]
  );
  const effectiveZoomDays = clampZoomDays(zoomDays, maxZoomDays);
  const points = useMemo(
    () => filterPointsByDays(yoyWindow.points, effectiveZoomDays),
    [effectiveZoomDays, yoyWindow.points]
  );
  const activeRange = activeRangeKey(effectiveZoomDays, maxZoomDays);
  const stats = chart.stats || {};
  const performance = result?.price_performance || chart.summary || {};
  const ticker = chart.ticker || result?.ticker;

  const setRange = (days) => {
    setZoomDays(clampZoomDays(days, maxZoomDays));
  };

  const zoomChart = (direction) => {
    setZoomDays((currentDays) => {
      const nextDays = direction === 'in' ? currentDays * 0.72 : currentDays * 1.28;
      return clampZoomDays(nextDays, maxZoomDays);
    });
  };

  if (chart.available !== true || points.length < 2) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="CHART DATA UNAVAILABLE" tone="amber">
          {chart.warning || 'Valid OHLC price chart data is not available for this analysis.'}
        </NoticeBox>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 border-b border-bloomberg-border space-y-4">
      <section>
        <SectionHeader label="CHART & PRICE" />
        <div>
          <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
            Source: {chart.source || 'N/A'}
          </div>
        </div>
      </section>

      {chart.warning && (
        <NoticeBox title="CHART DATA WARNING" tone="amber">
          {chart.warning}
        </NoticeBox>
      )}

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
            CHART
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex overflow-hidden rounded-sm border border-bloomberg-border bg-black"
              aria-label="Chart range selector"
            >
              {PRICE_RANGE_OPTIONS.map((option) => {
                const active = activeRange === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setRange(option.days)}
                    className={`min-w-10 px-3 py-1.5 font-mono text-[11px] tracking-wider transition-all duration-150 ${
                      active
                        ? 'bg-bloomberg-orange text-black shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]'
                        : 'text-bloomberg-muted hover:bg-white/5 hover:text-bloomberg-white'
                    }`}
                    aria-pressed={active}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="inline-flex overflow-hidden rounded-sm border border-bloomberg-border bg-black">
              <button
                type="button"
                onClick={() => zoomChart('in')}
                className="h-7 w-8 font-mono text-sm text-bloomberg-muted transition-colors hover:bg-white/5 hover:text-bloomberg-white disabled:opacity-35"
                disabled={effectiveZoomDays <= MIN_ZOOM_DAYS}
                aria-label="Zoom in chart"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoomChart('out')}
                className="h-7 w-8 border-l border-bloomberg-border font-mono text-sm text-bloomberg-muted transition-colors hover:bg-white/5 hover:text-bloomberg-white disabled:opacity-35"
                disabled={effectiveZoomDays >= maxZoomDays}
                aria-label="Zoom out chart"
              >
                −
              </button>
            </div>
          </div>
        </div>
        <CandlestickPriceChart
          points={points}
          allPoints={yoyWindow.points}
          ticker={ticker}
          onZoom={zoomChart}
        />
      </section>

      <section>
        <SectionHeader label="PRICE STATISTICS" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricBox label="START PRICE" value={displayPrice(stats.start_price, ticker)} />
          <MetricBox label="END PRICE" value={displayPrice(stats.end_price, ticker)} />
          <MetricBox label="HIGH" value={displayPrice(stats.high, ticker)} />
          <MetricBox label="LOW" value={displayPrice(stats.low, ticker)} />
          <MetricBox
            label="AVG VOLUME"
            value={formatCompactNumber(performance.average_volume ?? stats.average_volume)}
          />
          <MetricBox label="LATEST VOLUME" value={formatCompactNumber(performance.latest_volume)} />
          <MetricBox
            label="PERIOD RETURN"
            value={formatPercent(performance.period_return_percent ?? stats.change_percent)}
            highlight
          />
          <MetricBox
            label="MAX DRAWDOWN"
            value={formatPercent(performance.max_drawdown_percent)}
            quality={getFieldQuality(result?.data_quality, 'drawdown')}
            preserveSlot
          />
        </div>
      </section>
    </div>
  );
}

ChartPriceTab.propTypes = {
  result: PropTypes.object.isRequired,
};
