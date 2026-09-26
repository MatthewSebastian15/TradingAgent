import PropTypes from 'prop-types';

import { MetricCard } from '../charts';
import { finite, fmtLoss, fmtNum2, fmtPercent, fmtSignedPct, signedTone } from '../format';
import { CARD_GRID } from '../layout';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { HistogramChart } from '../viz/HistogramChart';
import { ScatterChart } from '../viz/ScatterChart';

const MAX_QQ_POINTS = 400;
const pctAxis = (v) => `${(v * 100).toFixed(1)}%`;
const signedClass = (v) =>
  v > 0 ? 'text-bloomberg-green' : v < 0 ? 'text-bloomberg-red' : 'text-bloomberg-white';

const seasonColumns = [
  { key: 'label', label: 'Period' },
  { key: 'count', label: 'Obs', align: 'right' },
  {
    key: 'meanPct',
    label: 'Mean',
    align: 'right',
    render: (r) => fmtSignedPct(r.meanPct),
    className: (r) => signedClass(r.meanPct),
  },
  {
    key: 'medianPct',
    label: 'Median',
    align: 'right',
    render: (r) => fmtSignedPct(r.medianPct),
    className: (r) => signedClass(r.medianPct),
  },
  { key: 'hitRate', label: 'Up share', align: 'right', render: (r) => fmtPercent(r.hitRate) },
];

export function DistributionSection({
  skew,
  kurt,
  var95,
  var99,
  cvar95,
  histogram,
  mu,
  sigma,
  jb,
  qq,
  weekday,
  month,
}) {
  const clipped = histogram.clippedLow + histogram.clippedHigh;
  // Downsample for render cost; always keep the first and last point (tail
  // extremes carry the most information in a QQ plot) and never drop to empty.
  const step = Math.max(1, Math.ceil(qq.length / MAX_QQ_POINTS));
  const qqShown = qq.filter((_, i) => i % step === 0 || i === qq.length - 1);
  const qqEdge = qq.length ? Math.max(Math.abs(qq[0].x), Math.abs(qq.at(-1).x)) : 3;

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
          ? ' with fat tails — big moves happen more often than a bell curve predicts'
          : ''}
        {jb
          ? jb.normalAt5
            ? '; normality is not rejected at 5%.'
            : '; normality is rejected at 5% (Jarque-Bera).'
          : '.'}
      </p>

      <div className={CARD_GRID}>
        <MetricCard
          label="Skewness"
          value={fmtNum2(skew)}
          tone={signedTone(skew)}
          formula="Adjusted Fisher-Pearson G1."
        />
        <MetricCard
          label="Excess Kurtosis"
          value={fmtNum2(kurt)}
          tone={finite(kurt) && kurt > 1 ? 'bad' : 'neutral'}
          formula="Unbiased G2; 0 = normal tails."
        />
        <MetricCard
          label="Jarque-Bera p-value"
          value={jb ? (jb.pValue < 0.001 ? '<0.001' : jb.pValue.toFixed(3)) : '—'}
          tone={jb && !jb.normalAt5 ? 'bad' : 'neutral'}
          gloss={
            jb
              ? `JB = ${jb.statistic.toFixed(1)}. Below 0.05 = not normal.`
              : 'Needs at least 8 returns.'
          }
        />
        <MetricCard
          label="Historical VaR (95%)"
          value={fmtLoss(var95)}
          tone="bad"
          gloss="Worst 1-in-20 period."
        />
        <MetricCard
          label="Historical VaR (99%)"
          value={fmtLoss(var99)}
          tone="bad"
          gloss="Worst 1-in-100 period."
        />
      </div>

      <HistogramChart
        title="Daily returns vs fitted normal"
        subtitle={
          clipped > 0
            ? `Axis clipped to the 0.5–99.5th percentile · ${clipped} outlier(s) not drawn`
            : 'Bars = observed frequency · line = normal with the same mean and stdev'
        }
        ariaLabel="Histogram of daily returns with a fitted normal overlay"
        bins={histogram.bins}
        formatX={pctAxis}
        overlay={{ mu, sigma }}
        markers={[
          finite(var95) && { x: var95 / 100, label: 'VaR 95%', color: CHART_COLORS.warning },
          finite(cvar95) && { x: cvar95 / 100, label: 'CVaR 95%', color: CHART_COLORS.quaternary },
          finite(var99) && { x: var99 / 100, label: 'VaR 99%', color: CHART_COLORS.down },
        ].filter(Boolean)}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <ScatterChart
          title="QQ plot vs normal"
          subtitle="Points bending away from the dashed line in the tails = fat tails"
          ariaLabel="QQ plot against the normal distribution"
          xLabel="Normal quantile"
          yLabel="Sample quantile (z)"
          formatX={(v) => v.toFixed(1)}
          formatY={(v) => v.toFixed(1)}
          points={qqShown.map((p) => ({ x: p.x, y: p.y, color: CHART_COLORS.primary, radius: 2 }))}
          lines={[
            {
              id: 'normal',
              label: 'Normal reference',
              color: CHART_COLORS.secondary,
              dashed: true,
              points: [
                { x: -qqEdge, y: -qqEdge },
                { x: qqEdge, y: qqEdge },
              ],
            },
          ]}
          emptyMessage="Not enough returns for a QQ plot."
        />
        <div className="space-y-3">
          <DataTable
            caption="Returns by weekday"
            rowKey={(r) => r.label}
            rows={weekday}
            columns={seasonColumns}
          />
          <DataTable
            caption="Returns by month"
            rowKey={(r) => r.label}
            rows={month}
            columns={seasonColumns}
          />
          <p className="text-[11px] text-bloomberg-white/80">
            Seasonality over a few years is mostly noise — check the observation count before
            reading anything into it.
          </p>
        </div>
      </div>
    </div>
  );
}

const seasonRows = PropTypes.arrayOf(
  PropTypes.shape({
    label: PropTypes.string,
    count: PropTypes.number,
    meanPct: PropTypes.number,
    medianPct: PropTypes.number,
    hitRate: PropTypes.number,
  })
);

DistributionSection.propTypes = {
  skew: PropTypes.number,
  kurt: PropTypes.number,
  var95: PropTypes.number,
  var99: PropTypes.number,
  cvar95: PropTypes.number,
  histogram: PropTypes.shape({
    bins: PropTypes.arrayOf(PropTypes.object).isRequired,
    clippedLow: PropTypes.number.isRequired,
    clippedHigh: PropTypes.number.isRequired,
  }).isRequired,
  mu: PropTypes.number.isRequired,
  sigma: PropTypes.number.isRequired,
  jb: PropTypes.object,
  qq: PropTypes.arrayOf(PropTypes.shape({ x: PropTypes.number, y: PropTypes.number })).isRequired,
  weekday: seasonRows.isRequired,
  month: seasonRows.isRequired,
};
