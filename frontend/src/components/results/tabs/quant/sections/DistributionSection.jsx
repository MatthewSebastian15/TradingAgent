import PropTypes from 'prop-types';

import { MetricCard } from '../charts';
import { finite, fmtLoss, fmtNum2, signedTone } from '../format';
import { CHART_COLORS } from '../viz/chartTheme';
import { HistogramChart } from '../viz/HistogramChart';

export function DistributionSection({ skew, kurt, var95, var99, bins, mu, sigma }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Daily returns are{' '}
        {finite(skew) && skew < -0.1
          ? 'left-skewed (crash-prone)'
          : finite(skew) && skew > 0.1
            ? 'right-skewed'
            : 'roughly symmetric'}
        {finite(kurt) && kurt > 1
          ? ' with fat tails — big moves happen more often than a bell curve predicts.'
          : '.'}
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Skewness"
          value={fmtNum2(skew)}
          tone={signedTone(skew)}
          gloss="Negative = longer left (loss) tail; positive = longer right (gain) tail."
          formula="Third standardized moment of daily returns."
        />
        <MetricCard
          label="Excess Kurtosis"
          value={fmtNum2(kurt)}
          tone={finite(kurt) && kurt > 1 ? 'bad' : 'neutral'}
          gloss="0 = normal tails; higher = fatter tails / more outliers."
          formula="Fourth standardized moment − 3."
        />
        <MetricCard
          label="Historical VaR (95%)"
          value={fmtLoss(var95)}
          tone="bad"
          gloss="Worst 1-in-20-day loss."
          formula="5th-percentile daily return."
        />
        <MetricCard
          label="Historical VaR (99%)"
          value={fmtLoss(var99)}
          tone="bad"
          gloss="Worst 1-in-100-day loss — deeper tail risk."
          formula="1st-percentile daily return."
        />
      </div>
      <HistogramChart
        title="Daily returns vs fitted normal"
        subtitle="Bars = observed frequency · line = normal with the same mean and stdev"
        ariaLabel="Histogram of daily returns with a fitted normal overlay"
        bins={bins}
        formatX={(v) => `${(v * 100).toFixed(1)}%`}
        overlay={{ mu, sigma }}
        markers={[
          finite(var95) && { x: var95 / 100, label: 'VaR 95%', color: CHART_COLORS.warning },
          finite(var99) && { x: var99 / 100, label: 'VaR 99%', color: CHART_COLORS.down },
        ].filter(Boolean)}
      />
    </div>
  );
}

DistributionSection.propTypes = {
  skew: PropTypes.number,
  kurt: PropTypes.number,
  var95: PropTypes.number,
  var99: PropTypes.number,
  bins: PropTypes.arrayOf(PropTypes.object).isRequired,
  mu: PropTypes.number.isRequired,
  sigma: PropTypes.number.isRequired,
};
