import PropTypes from 'prop-types';
import { useCallback } from 'react';

import { SkeletonRow } from './primitives';
import { getGrowthTrend } from '../../api/market';
import { useResearchData } from '../../hooks/useResearchData';

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
const BAR_WIDTH = 8;
const GAP = 4;
const HEIGHT = 28;

function BarSeries({ label, testId, values, periods }) {
  const finite = values.filter((v) => Number.isFinite(v));
  const max = Math.max(...finite.map(Math.abs), 1);
  const width = values.length * (BAR_WIDTH + GAP) - GAP;
  const latest = [...values].reverse().find((v) => Number.isFinite(v));

  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 font-mono text-[9px] text-bloomberg-muted">{label}</span>
      <svg
        role="img"
        aria-label={`${label} by quarter, ${periods[0]} to ${periods[periods.length - 1]}`}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        className="h-7 flex-1"
        preserveAspectRatio="none"
      >
        {values.map((value, index) => {
          if (!Number.isFinite(value)) return null;
          const height = Math.max(1, (Math.abs(value) / max) * HEIGHT);
          return (
            <rect
              key={periods[index]}
              data-testid={testId}
              className={value < 0 ? 'fill-bloomberg-red' : 'fill-bloomberg-green'}
              x={index * (BAR_WIDTH + GAP)}
              y={HEIGHT - height}
              width={BAR_WIDTH}
              height={height}
            >
              <title>{`${periods[index]}: ${compact.format(value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <span className="w-14 shrink-0 text-right font-mono text-[10px] text-bloomberg-white">
        {latest !== undefined ? compact.format(latest) : 'N/A'}
      </span>
    </div>
  );
}

BarSeries.propTypes = {
  label: PropTypes.string.isRequired,
  testId: PropTypes.string.isRequired,
  values: PropTypes.arrayOf(PropTypes.number).isRequired,
  periods: PropTypes.arrayOf(PropTypes.string).isRequired,
};

// Quarter-over-quarter revenue and net income for the growth card. Non-blocking: renders
// nothing without a ticker, with fewer than two quarters, or when the request fails.
export default function GrowthSparkline({ ticker }) {
  const load = useCallback(
    ({ signal }) => (ticker ? getGrowthTrend(ticker, { signal }) : Promise.resolve(null)),
    [ticker]
  );
  const { data, loading } = useResearchData(load);
  const quarters = data?.quarters || [];

  if (!ticker) return null;
  if (loading) return <SkeletonRow />;
  if (quarters.length < 2) return null;

  const periods = quarters.map((q) => q.period);
  return (
    <div
      data-testid="growth-sparkline"
      className="px-3 py-3 border-b border-bloomberg-border space-y-2"
    >
      <BarSeries
        label="REVENUE"
        testId="growth-bar-revenue"
        periods={periods}
        values={quarters.map((q) => q.revenue)}
      />
      <BarSeries
        label="NET INCOME"
        testId="growth-bar-earnings"
        periods={periods}
        values={quarters.map((q) => q.earnings)}
      />
      <div className="flex justify-between font-mono text-[9px] text-bloomberg-muted pl-[72px] pr-14">
        <span>{periods[0]}</span>
        <span>{periods[periods.length - 1]}</span>
      </div>
    </div>
  );
}

GrowthSparkline.propTypes = { ticker: PropTypes.string };
