import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
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

function displayPrice(value, ticker) {
  return formatPrice(value, ticker) || 'N/A';
}

export default function ChartPriceTab({ result }) {
  const chart = result?.price_chart || {};
  const points = normalizePricePoints(chart.points);
  const stats = chart.stats || {};
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <MetricBox label="WINDOW" value={chart.window_label || 'N/A'} highlight />
          <MetricBox label="POINTS" value={points.length} />
          <MetricBox label="SOURCE" value={chart.source || 'N/A'} />
          <MetricBox label="CHANGE" value={formatPercent(stats.change_percent)} highlight />
        </div>
      </section>

      <section>
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
          OHLC Candlestick
        </div>
        <CandlestickPriceChart points={points} ticker={ticker} />
      </section>

      <section>
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
          Volume
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
    </div>
  );
}

ChartPriceTab.propTypes = {
  result: PropTypes.object.isRequired,
};
