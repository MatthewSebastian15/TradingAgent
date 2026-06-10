import { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
import { getFieldQuality } from '../../../utils/dataStatus';
import CandlestickPriceChart from './CandlestickPriceChart';
import { formatCompactNumber, resolveYoyPriceWindow } from './priceChartUtils';
import VolumeChart from './VolumeChart';

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

const PRICE_RANGE_OPTIONS = [
  { key: '1Y', label: '1Y', months: 12 },
  { key: '6M', label: '6M', months: 6 },
  { key: '3M', label: '3M', months: 3 },
  { key: '1M', label: '1M', months: 1 },
  { key: '1W', label: '1W', days: 7 },
];

function parseIsoDate(dateValue) {
  if (!dateValue) return null;
  const date = new Date(`${String(dateValue).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function subtractMonths(date, months) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const maxDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)
  ).getUTCDate();
  result.setUTCDate(Math.min(day, maxDay));
  return result;
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function filterPointsByRange(points, rangeKey) {
  if (!Array.isArray(points) || points.length < 2) return points || [];
  const selectedRange = PRICE_RANGE_OPTIONS.find((option) => option.key === rangeKey);
  if (!selectedRange || rangeKey === '1Y') return points;

  const endPoint = points.at(-1);
  const endDate = parseIsoDate(endPoint?.date);
  if (!endDate) return points;

  const startDate = selectedRange.days
    ? new Date(endDate.getTime() - selectedRange.days * 24 * 60 * 60 * 1000)
    : subtractMonths(endDate, selectedRange.months);
  const startIso = toIsoDate(startDate);
  const filtered = points.filter((point) => point.date >= startIso && point.date <= endPoint.date);

  return filtered.length >= 2 ? filtered : points.slice(-2);
}

export default function ChartPriceTab({ result }) {
  const [activeRange, setActiveRange] = useState('1Y');
  const chart = result?.price_chart || EMPTY_PRICE_CHART;
  const yoyWindow = useMemo(() => resolveYoyPriceWindow(chart, chart.points), [chart]);
  const points = useMemo(
    () => filterPointsByRange(yoyWindow.points, activeRange),
    [activeRange, yoyWindow.points]
  );
  const stats = chart.stats || {};
  const performance = result?.price_performance || chart.summary || {};
  const ticker = chart.ticker || result?.ticker;

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
          <div className="flex flex-wrap gap-1" aria-label="Chart range selector">
            {PRICE_RANGE_OPTIONS.map((option) => {
              const active = activeRange === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setActiveRange(option.key)}
                  className={`border px-2.5 py-1 font-mono text-[11px] tracking-wider transition-colors ${
                    active
                      ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                      : 'border-bloomberg-border bg-black text-bloomberg-muted hover:text-bloomberg-white'
                  }`}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>
        <CandlestickPriceChart points={points} ticker={ticker} />
      </section>

      <section>
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
          VOLUME
        </div>
        <VolumeChart points={points} />
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
