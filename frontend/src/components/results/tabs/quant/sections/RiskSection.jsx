import PropTypes from 'prop-types';

import PriceMetricLineChart from '../../PriceMetricLineChart';
import { MetricCard } from '../charts';
import {
  fmtAbs,
  fmtLoss,
  fmtNum2,
  fmtPercent,
  fmtRatio,
  fmtSignedPct,
  ratioTone,
  signedTone,
} from '../format';

export function RiskSection({
  dd,
  cal,
  histVaR,
  paramVaR,
  cfVaR,
  cv,
  downDev,
  shp,
  srt,
  bta,
  alf,
  rfPct,
  benchAvailable,
  benchLabel,
  ddPoints,
  rsPoints,
  rbPoints,
  ddStats,
}) {
  const excessLabel = `excess over ${rfPct.toFixed(1)}%`;
  const benchNote = benchAvailable
    ? `Benchmark: ${benchLabel}, matched to the ticker's home market.`
    : `${benchLabel} benchmark data is unavailable.`;
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        On a typical bad day you might lose about{' '}
        <span className="text-bloomberg-red">{fmtAbs(histVaR)}</span> (95% historical VaR); on the
        very worst days, around <span className="text-bloomberg-red">{fmtAbs(cv)}</span> on average.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <MetricCard
          label="Max Drawdown"
          value={fmtLoss(dd)}
          tone="bad"
          gloss="Worst peak-to-trough drop over the whole history."
          formula="Largest (price − running peak) / peak across the series. Matches the existing drawdown chart."
        />
        <MetricCard
          label="Historical VaR (95%)"
          value={fmtLoss(histVaR)}
          tone="bad"
          gloss="On 95% of days you lose less than this; only the worst 5% are deeper."
          formula="5th-percentile of actual daily returns. No distribution assumed."
        />
        <MetricCard
          label="Parametric VaR (95%)"
          value={fmtLoss(paramVaR)}
          tone="bad"
          gloss="Same idea, read off a normal bell curve tuned to recent volatility."
          formula="mean − 1.645 × EWMA vol (λ=0.94, recent days weighted more). Trusts the bell-curve shape (understates rare crashes)."
        />
        <MetricCard
          label="Cornish-Fisher VaR (95%)"
          value={fmtLoss(cfVaR)}
          tone="bad"
          gloss="Parametric VaR adjusted for this stock's actual skew and fat tails."
          formula="Normal z-quantile expanded with sample skewness and excess kurtosis (Cornish-Fisher), × stddev. Blank when the moments are too extreme for the expansion."
        />
        <MetricCard
          label="Conditional VaR (95%)"
          value={fmtLoss(cv)}
          tone="bad"
          gloss="The average loss inside that worst-5% tail."
          formula="Mean of all returns beyond the historical VaR threshold. Always ≥ VaR."
        />
        <MetricCard
          label="Downside Deviation"
          value={fmtPercent(downDev)}
          gloss="Volatility of only the losing days — the swings that actually scare you."
          formula="√(mean of min(0, return)²) × √252 × 100%."
        />
        <MetricCard
          label={`Sharpe (${excessLabel})`}
          value={fmtRatio(shp)}
          tone={ratioTone(shp)}
          gloss="Return per unit of total risk. Higher is a better deal."
          formula={`(mean(returns) − rf) / stddev(returns) × √252. Risk-free rate = ${rfPct.toFixed(1)}% annual.`}
        />
        <MetricCard
          label={`Sortino (${excessLabel})`}
          value={fmtRatio(srt)}
          tone={ratioTone(srt)}
          gloss="Like Sharpe but only penalizes downside risk — fairer to big upside moves."
          formula={`(mean(returns) − rf) / downside-deviation × √252. Risk-free rate = ${rfPct.toFixed(1)}% annual.`}
        />
        <MetricCard
          label={`Beta (vs ${benchLabel})`}
          value={fmtNum2(bta)}
          gloss="1.0 moves with the market; above 1 is jumpier, below 1 is calmer."
          formula={`cov(stock, ${benchLabel}) / var(${benchLabel}), on overlapping trading days. ${benchNote}`}
        />
        <MetricCard
          label="Alpha (annualized)"
          value={fmtSignedPct(alf)}
          tone={signedTone(alf)}
          gloss="Return beyond what beta alone would predict — the 'skill' return vs the market."
          formula={`Jensen's alpha: (stock − rf) − β·(market − rf), annualized. ${benchNote}`}
        />
        <MetricCard
          label="Calmar Ratio"
          value={fmtRatio(cal)}
          tone={ratioTone(cal)}
          gloss="Annual growth per unit of worst drawdown — reward vs the deepest pain."
          formula="CAGR ÷ |max drawdown|. Higher means smoother growth."
        />
      </div>

      {ddStats && (
        <div className="space-y-1">
          <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
            Drawdown recovery
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <MetricCard
              label="Max DD Duration"
              value={`${ddStats.maxDDDuration}d`}
              gloss="Trading days from the peak to full recovery (or to today if still underwater)."
            />
            <MetricCard
              label="Recovery Time"
              value={ddStats.recoveryDays != null ? `${ddStats.recoveryDays}d` : 'Not recovered'}
              tone={ddStats.maxDDRecovered ? 'neutral' : 'bad'}
              gloss="Trading days from the deepest trough back to the prior peak."
            />
            <MetricCard
              label="Currently Underwater"
              value={ddStats.currentUnderwaterDays > 0 ? `${ddStats.currentUnderwaterDays}d` : 'No'}
              tone={ddStats.currentUnderwaterDays > 0 ? 'bad' : 'good'}
              gloss="Trading days below the last all-time high, as of today."
            />
            <MetricCard
              label="Drawdowns > 5%"
              value={String(ddStats.episodes)}
              gloss="Count of distinct peak-to-recovery episodes deeper than 5%."
            />
            <MetricCard label="Max Drawdown" value={fmtLoss(ddStats.maxDD)} tone="bad" />
          </div>
        </div>
      )}

      <PriceMetricLineChart
        title="Underwater (drawdown) curve"
        subtitle="Percent below the running peak — depth and duration of every dip"
        points={ddPoints}
        valueType="percent"
        emptyMessage="Not enough history for a drawdown chart."
      />

      <PriceMetricLineChart
        title="Rolling Sharpe (63-day)"
        subtitle="Risk-adjusted return over a sliding quarter"
        points={rsPoints}
        valueType="number"
        emptyMessage="Not enough history for a rolling-Sharpe chart."
      />

      <PriceMetricLineChart
        title={`Rolling Beta vs ${benchLabel} (63-day)`}
        subtitle={benchAvailable ? 'Market sensitivity over time' : 'Benchmark data unavailable'}
        points={rbPoints}
        valueType="number"
        emptyMessage="Not enough overlapping history for a rolling-beta chart."
      />
    </div>
  );
}

RiskSection.propTypes = {
  dd: PropTypes.number,
  cal: PropTypes.number,
  histVaR: PropTypes.number,
  paramVaR: PropTypes.number,
  cfVaR: PropTypes.number,
  cv: PropTypes.number,
  downDev: PropTypes.number,
  shp: PropTypes.number,
  srt: PropTypes.number,
  bta: PropTypes.number,
  alf: PropTypes.number,
  rfPct: PropTypes.number.isRequired,
  benchAvailable: PropTypes.bool.isRequired,
  benchLabel: PropTypes.string.isRequired,
  ddPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rsPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  rbPoints: PropTypes.arrayOf(PropTypes.object).isRequired,
  ddStats: PropTypes.object,
};
