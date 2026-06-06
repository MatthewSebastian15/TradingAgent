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

function displayLabel(value) {
  if (!hasValue(value)) return 'N/A';
  return String(value).replace(/_/g, ' ').toUpperCase();
}

function formatWindowLabel(chart) {
  if (hasValue(chart.lookback_days)) return `${chart.lookback_days} Days Price`;
  return chart.window_label || 'N/A';
}

export default function ChartPriceTab({ result }) {
  const chart = result?.price_chart || {};
  const points = normalizePricePoints(chart.points);
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
          <div className="font-mono text-sm font-semibold text-bloomberg-white">
            {formatWindowLabel(chart)}
          </div>
          <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
            Source: {chart.source || 'N/A'}
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
          <MetricBox label="AVG CLOSE" value={displayPrice(stats.average_close, ticker)} />
          <MetricBox label="AVG VOLUME" value={formatCompactNumber(stats.average_volume)} />
          <MetricBox label="TRADE DATE" value={chart.trade_date || result.trade_date || 'N/A'} />
          <MetricBox
            label="LOOKBACK"
            value={`${hasValue(chart.lookback_days) ? chart.lookback_days : 'N/A'} days`}
          />
        </div>
      </section>

      <section>
        <SectionHeader label="PRICE PERFORMANCE" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricBox
            label="PERIOD RETURN"
            value={formatPercent(performance.period_return_percent ?? stats.change_percent)}
            highlight
          />
          <MetricBox
            label="PERIOD HIGH"
            value={displayPrice(performance.period_high ?? stats.high, ticker)}
          />
          <MetricBox
            label="PERIOD LOW"
            value={displayPrice(performance.period_low ?? stats.low, ticker)}
          />
          <MetricBox
            label="MAX DRAWDOWN"
            value={formatPercent(performance.max_drawdown_percent)}
            quality={getFieldQuality(result?.data_quality, 'drawdown')}
            preserveSlot
          />
          <MetricBox
            label="LATEST CLOSE"
            value={displayPrice(performance.latest_close ?? stats.end_price, ticker)}
          />
          <MetricBox
            label="AVERAGE VOLUME"
            value={formatCompactNumber(performance.average_volume ?? stats.average_volume)}
          />
          <MetricBox label="LATEST VOLUME" value={formatCompactNumber(performance.latest_volume)} />
          <MetricBox label="VOLUME TREND" value={displayLabel(performance.volume_trend)} />
        </div>
      </section>
    </div>
  );
}

ChartPriceTab.propTypes = {
  result: PropTypes.object.isRequired,
};
