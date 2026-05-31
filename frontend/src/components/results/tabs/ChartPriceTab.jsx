import PropTypes from 'prop-types';
import { formatPrice } from '../../../utils/formatting';
import MetricBox from '../MetricBox';
import NoticeBox from '../NoticeBox';
import SectionHeader from '../SectionHeader';
import PriceLineChart from './PriceLineChart';
import VolumeChart from './VolumeChart';

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

function formatPercent(value) {
  if (!hasValue(value)) return 'N/A';
  return `${Number(value).toFixed(2)}%`;
}

export default function ChartPriceTab({ result }) {
  const chart = result?.price_chart || {};
  const points = Array.isArray(chart.points) ? chart.points : [];
  const stats = chart.stats || {};
  const ticker = result?.ticker;

  if (!chart.available || points.length === 0) {
    return (
      <div className="px-4 py-4 border-b border-bloomberg-border">
        <NoticeBox title="CHART DATA UNAVAILABLE" tone="amber">
          {chart.warning || 'Price chart data is not available for this analysis.'}
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
          <MetricBox label="POINTS" value={stats.point_count || points.length} />
          <MetricBox label="SOURCE" value={chart.source || 'N/A'} />
          <MetricBox label="CHANGE" value={formatPercent(stats.change_percent)} highlight />
        </div>
      </section>

      <section>
        <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-2">
          Close Price
        </div>
        <PriceLineChart points={points} />
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
          <MetricBox label="START PRICE" value={formatPrice(stats.start_price, ticker)} />
          <MetricBox label="END PRICE" value={formatPrice(stats.end_price, ticker)} />
          <MetricBox label="HIGH" value={formatPrice(stats.high, ticker)} />
          <MetricBox label="LOW" value={formatPrice(stats.low, ticker)} />
          <MetricBox label="AVG CLOSE" value={formatPrice(stats.average_close, ticker)} />
          <MetricBox label="AVG VOLUME" value={stats.average_volume || 'N/A'} />
          <MetricBox label="TRADE DATE" value={chart.trade_date || result.trade_date || 'N/A'} />
          <MetricBox label="LOOKBACK" value={`${chart.lookback_days || 'N/A'} days`} />
        </div>
      </section>
    </div>
  );
}

ChartPriceTab.propTypes = {
  result: PropTypes.object.isRequired,
};
