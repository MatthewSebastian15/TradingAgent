import PropTypes from 'prop-types';

import PriceMetricLineChart from '../../PriceMetricLineChart';
import { MetricCard } from '../charts';
import { fmtPercent, volBucket } from '../format';

export function VolatilitySection({ vol, ewma, rollingVols, rollingPoints }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        This stock&apos;s price swings are{' '}
        <span className="text-white">{volBucket(vol).toLowerCase()}</span> — annualized volatility
        is {fmtPercent(vol)}.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Annualized Volatility"
          value={fmtPercent(vol)}
          gloss={`${volBucket(vol)} — how much daily returns spread out, scaled to a year.`}
          formula="Standard deviation of daily simple returns × √252 × 100%. Matches the server-side risk summary."
          spark={rollingVols}
        />
        <MetricCard
          label="EWMA Volatility (recent)"
          value={fmtPercent(ewma)}
          gloss="Recent-weighted volatility — reacts faster to the latest calm or chaos."
          formula="RiskMetrics EWMA: varₜ = 0.94·varₜ₋₁ + 0.06·rₜ², annualized."
        />
      </div>

      <PriceMetricLineChart
        title="Rolling Volatility (21-day)"
        subtitle="Annualized volatility over a sliding one-month window"
        points={rollingPoints}
        valueType="percent"
        emptyMessage="Not enough history for a rolling-volatility chart."
      />
    </div>
  );
}

VolatilitySection.propTypes = {
  vol: PropTypes.number,
  ewma: PropTypes.number,
  rollingVols: PropTypes.arrayOf(PropTypes.number).isRequired,
  rollingPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
};
