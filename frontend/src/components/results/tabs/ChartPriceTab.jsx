import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
import { getFieldQuality } from '../../../utils/dataStatus';
import CandlestickPriceChart from './CandlestickPriceChart';
import { formatCompactNumber, normalizePricePoints } from './priceChartUtils';
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

function isIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function subtractOneYear(dateValue) {
  if (!isIsoDate(dateValue)) return null;
  const [year, month, day] = String(dateValue).split('-').map(Number);
  const targetYear = year - 1;
  const safeDay = Math.min(day, daysInMonth(targetYear, month));
  return `${targetYear}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

function yoyWindowDates(chart, points) {
  const endDate = isIsoDate(chart.end_date)
    ? chart.end_date
    : isIsoDate(chart.trade_date)
      ? chart.trade_date
      : points.at(-1)?.date;
  const startDate = isIsoDate(chart.start_date)
    ? chart.start_date
    : subtractOneYear(endDate) || points[0]?.date;

  return { startDate, endDate };
}

function formatWindowLabel(chart, points) {
  if (String(chart.window || '').toUpperCase() === 'YOY' || hasValue(chart.lookback_days)) {
    const { startDate, endDate } = yoyWindowDates(chart, points);
    if (startDate && endDate) return `YOY Price Window (${startDate} to ${endDate})`;
    return 'YOY Price Window';
  }
  return chart.window_label || 'N/A';
}

export default function ChartPriceTab({ result }) {
  const chart = result?.price_chart || {};
  const points = normalizePricePoints(chart.points);
  const stats = chart.stats || {};
  const performance = result?.price_performance || chart.summary || {};
  const ticker = chart.ticker || result?.ticker;
  const { startDate, endDate } = yoyWindowDates(chart, points);

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
          <div className="font-mono text-sm font-semibold text-bloomberg-white">
            {formatWindowLabel(chart, points)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
            Source: {chart.source || 'N/A'}
          </div>
          <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
            Window: YOY · Start Date: {startDate || 'N/A'} · End Date: {endDate || 'N/A'}
          </div>
        </div>
      </section>

      <section>
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
          CHART
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
