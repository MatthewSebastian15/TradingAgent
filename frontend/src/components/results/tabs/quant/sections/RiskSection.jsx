import PropTypes from 'prop-types';
import { useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import {
  bootstrapCI,
  cornishFisherVaR,
  cvar,
  historicalVaR,
  horizonReturns,
  parametricVaR,
  scaleVaR,
} from '../../quantUtils';
import { MetricCard, NumberField } from '../charts';
import {
  DASH,
  finite,
  fmtAbs,
  fmtLoss,
  fmtNum2,
  fmtPercent,
  fmtRatio,
  fmtSignedPct,
  ratioTone,
  sampleNote,
  significanceNote,
} from '../format';
import { CARD_GRID, FIELD_GRID } from '../layout';
import { ProOnly, useQuantMode } from '../mode';
import { fmtMoney } from '../numberFormat';
import { SegmentedControl } from '../SegmentedControl';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { LineChart } from '../viz/LineChart';

const HORIZONS = [1, 10];
const toSeries = (pts) => pts.map((p) => ({ x: p.date, y: p.value }));

export function RiskSection({
  ccy,
  rfPct,
  benchLabel,
  benchAvailable,
  benchStatus,
  returns,
  closes,
  ewmaSigma,
  dd,
  cal,
  srt,
  downDev,
  sharpeInfo,
  obs,
  benchStats,
  ddStats,
  topDD,
  ddPoints,
  rsPoints,
  rbPoints,
}) {
  const { mode } = useQuantMode();
  const [horizon, setHorizon] = useState(1);
  const [position, setPosition] = useState('');
  const excessLabel = `excess over ${rfPct.toFixed(1)}%`;

  const varRows = useMemo(() => {
    const sample = horizon === 1 ? returns : horizonReturns(closes, horizon);
    const enough = sample.length >= 20;
    const ci = (stat) =>
      enough ? bootstrapCI(sample, stat, { samples: 400, level: 0.9, seed: 7 }) : null;
    const param = parametricVaR(returns, 0.95, ewmaSigma);
    const cf = cornishFisherVaR(returns);
    const scaled = horizon === 1 ? '' : ` × √${horizon}`;
    return [
      {
        method: 'Historical',
        value: enough ? historicalVaR(sample) : null,
        ci: ci((s) => historicalVaR(s)),
        note:
          horizon === 1
            ? '5th percentile of daily returns'
            : `5th percentile of overlapping ${horizon}-day returns`,
      },
      {
        method: 'Parametric (EWMA)',
        value: horizon === 1 ? param : scaleVaR(param, horizon),
        ci: null,
        note: `Zero mean, −1.645 × EWMA σ${scaled}`,
      },
      {
        method: 'Cornish-Fisher',
        value: horizon === 1 ? cf : scaleVaR(cf, horizon),
        ci: null,
        note: `Skew/kurtosis-adjusted quantile${scaled}${horizon === 1 ? '' : ' (approx.)'}`,
      },
      {
        method: 'Expected shortfall (CVaR)',
        value: enough ? cvar(sample) : null,
        ci: ci((s) => cvar(s)),
        note: 'Average loss beyond the historical VaR',
      },
    ];
  }, [horizon, returns, closes, ewmaSigma]);

  const positionValue = Number(position);
  const amount = (v) =>
    position !== '' && positionValue > 0 && finite(v)
      ? fmtMoney((Math.abs(v) / 100) * positionValue, ccy)
      : DASH;

  const s = benchStats;
  const benchRows = s
    ? [
        {
          metric: `Beta vs ${benchLabel}`,
          value: fmtNum2(s.beta),
          note: '1.0 moves with the market',
        },
        {
          metric: 'R²',
          value: finite(s.rSquared) ? fmtPercent(s.rSquared * 100) : DASH,
          note: 'Variance explained by the benchmark; low R² makes beta unreliable',
        },
        { metric: 'Correlation', value: fmtNum2(s.correlation), note: 'Daily co-movement' },
        {
          metric: 'Alpha (annualized)',
          value: `${fmtSignedPct(s.alpha)}${finite(s.alphaTStat) ? ` · t = ${fmtNum2(s.alphaTStat)}` : ''}`,
          note:
            finite(s.alphaTStat) && Math.abs(s.alphaTStat) < 2
              ? 'Not significant: |t| below 2'
              : 'Significant at roughly 95%: |t| of 2 or more',
        },
        {
          metric: 'Tracking error',
          value: fmtPercent(s.trackingError),
          note: 'Annualized volatility of return minus benchmark',
        },
        {
          metric: 'Information ratio',
          value: fmtRatio(s.informationRatio),
          note: 'Active return per unit of tracking error',
        },
        {
          metric: 'Up capture',
          value: fmtPercent(s.upCapture),
          note: 'Share of benchmark up-day gains captured',
        },
        {
          metric: 'Down capture',
          value: fmtPercent(s.downCapture),
          note: 'Below 100% = falls less than the market',
        },
      ]
    : [];

  const allVarColumns = [
    { key: 'method', label: 'Method' },
    {
      key: 'value',
      label: `VaR 95% (${horizon}D)`,
      align: 'right',
      render: (r) => fmtLoss(r.value),
      className: () => 'text-bloomberg-red',
    },
    {
      key: 'amount',
      label: 'Amount at risk',
      align: 'right',
      render: (r) => amount(r.value),
    },
    {
      key: 'ci',
      label: '90% bootstrap CI',
      align: 'right',
      render: (r) => (r.ci ? `${fmtLoss(r.ci.lo)} … ${fmtLoss(r.ci.hi)}` : DASH),
    },
    { key: 'note', label: 'Basis', className: () => 'text-bloomberg-white/80' },
  ];
  const varColumns =
    mode === 'basic'
      ? allVarColumns.filter((c) => c.key !== 'ci' && c.key !== 'note')
      : allVarColumns;

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        On a typical bad day you might lose about{' '}
        <span className="text-bloomberg-red">{fmtAbs(historicalVaR(returns))}</span> (95% historical
        VaR); on the very worst days, around{' '}
        <span className="text-bloomberg-red">{fmtAbs(cvar(returns))}</span> on average.
      </p>

      <div className={CARD_GRID}>
        <MetricCard
          label="Max Drawdown"
          value={fmtLoss(dd)}
          tone="bad"
          gloss="Worst peak-to-trough drop."
        />
        <MetricCard
          label={`Sharpe (${excessLabel})`}
          value={fmtRatio(sharpeInfo?.sharpe)}
          tone={ratioTone(sharpeInfo?.sharpe)}
          sample={
            sharpeInfo
              ? `SE ${fmtNum2(sharpeInfo.standardError)} · P(SR>0) ${fmtPercent(sharpeInfo.probabilisticSharpe * 100)} · ${significanceNote({ n: sharpeInfo.observations, tStat: sharpeInfo.tStat })}`
              : sampleNote(obs)
          }
          formula="(mean − rf) / stdev × √periods. SE per Mertens (skew/kurtosis adjusted); P(SR>0) is the Probabilistic Sharpe Ratio."
        />
        <MetricCard
          label={`Sortino (${excessLabel})`}
          value={fmtRatio(srt)}
          tone={ratioTone(srt)}
          sample={sampleNote(obs)}
          formula="(mean − rf) / downside deviation × √periods."
        />
        <MetricCard
          label="Calmar Ratio"
          value={fmtRatio(cal)}
          tone={ratioTone(cal)}
          formula="CAGR ÷ |max drawdown|."
        />
        <MetricCard
          label="Downside Deviation"
          value={fmtPercent(downDev)}
          formula="√mean(min(0, r)²) × √periods."
        />
      </div>

      <div className={FIELD_GRID}>
        <SegmentedControl
          label="Horizon"
          ariaLabel="VaR horizon"
          options={HORIZONS.map((h) => ({ id: h, label: `${h}D` }))}
          value={horizon}
          onChange={setHorizon}
        />
        <NumberField
          label="Position value"
          value={position}
          onChange={setPosition}
          suffix={ccy || 'ccy'}
        />
      </div>

      <DataTable
        caption="Value at Risk"
        rowKey={(r) => r.method}
        rows={varRows}
        columns={varColumns}
      />
      <ProOnly>
        {horizon > 1 && (
          <p className="text-[11px] text-bloomberg-white/80">
            Overlapping {horizon}-day returns are autocorrelated, so their bootstrap interval is
            narrower than the true uncertainty.
          </p>
        )}
      </ProOnly>

      <ProOnly>
        {benchStatus === 'loading' ? (
          <div
            role="status"
            aria-label="Loading benchmark statistics"
            className="border border-bloomberg-border"
          >
            <div className="bg-black px-2 py-1.5 text-xs tracking-wider text-bloomberg-orange uppercase">
              {`Relative to ${benchLabel}`}
            </div>
            <div className="space-y-1 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <div
                  key={i}
                  aria-hidden="true"
                  className="h-5 animate-pulse bg-bloomberg-surface"
                />
              ))}
            </div>
          </div>
        ) : benchStatus === 'unavailable' ? (
          <NoticeBox title="Benchmark unavailable">
            {`${benchLabel} prices could not be loaded, so beta, alpha and capture ratios are not shown. Pick another benchmark in the context bar or try again later.`}
          </NoticeBox>
        ) : (
          <DataTable
            caption={`Relative to ${benchLabel} · n=${s?.observations ?? 0}`}
            rowKey={(r) => r.metric}
            rows={benchRows}
            emptyMessage="Not enough overlapping benchmark history (need 20 days)."
            columns={[
              { key: 'metric', label: 'Metric' },
              { key: 'value', label: 'Value', align: 'right' },
              { key: 'note', label: 'Reading', className: () => 'text-bloomberg-white/80' },
            ]}
          />
        )}
      </ProOnly>

      <ProOnly>
        {ddStats && (
          <div className={CARD_GRID}>
            <MetricCard
              label="Max DD Duration"
              value={`${ddStats.maxDDDuration}d`}
              gloss="Peak to full recovery (or today)."
            />
            <MetricCard
              label="Recovery Time"
              value={ddStats.recoveryDays != null ? `${ddStats.recoveryDays}d` : 'Not recovered'}
              tone={ddStats.maxDDRecovered ? 'neutral' : 'bad'}
              gloss="Deepest trough back to the prior peak."
            />
            <MetricCard
              label="Currently Underwater"
              value={ddStats.currentUnderwaterDays > 0 ? `${ddStats.currentUnderwaterDays}d` : 'No'}
              tone={ddStats.currentUnderwaterDays > 0 ? 'bad' : 'good'}
              gloss="Periods below the last all-time high."
            />
            <MetricCard
              label="Drawdowns > 5%"
              value={String(ddStats.episodes)}
              gloss="Distinct episodes deeper than 5%."
            />
          </div>
        )}
      </ProOnly>

      <ProOnly>
        <DataTable
          caption="Top drawdowns"
          rowKey={(r) => r.peakDate}
          rows={topDD}
          emptyMessage="No drawdowns in this window."
          columns={[
            { key: 'peakDate', label: 'Peak' },
            { key: 'troughDate', label: 'Trough' },
            { key: 'recoveryDate', label: 'Recovered', render: (r) => r.recoveryDate || 'Not yet' },
            {
              key: 'depth',
              label: 'Depth',
              align: 'right',
              render: (r) => fmtLoss(r.depth),
              className: () => 'text-bloomberg-red',
            },
            {
              key: 'lengthDays',
              label: 'Length',
              align: 'right',
              render: (r) => `${r.lengthDays}d`,
            },
            {
              key: 'recoveryDays',
              label: 'Trough → recovery',
              align: 'right',
              render: (r) => (r.recoveryDays == null ? DASH : `${r.recoveryDays}d`),
            },
          ]}
        />
      </ProOnly>

      <LineChart
        title="Underwater curve"
        subtitle="Percent below the running peak"
        ariaLabel="Underwater drawdown curve"
        formatY={(v) => `${v.toFixed(0)}%`}
        includeZero
        series={[
          { id: 'dd', label: 'Drawdown', color: CHART_COLORS.down, points: toSeries(ddPoints) },
        ]}
        emptyMessage="Not enough history for a drawdown chart."
      />
      <ProOnly>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <LineChart
            title="Rolling Sharpe (63 periods)"
            ariaLabel="Rolling Sharpe ratio"
            series={[
              {
                id: 'rs',
                label: 'Sharpe',
                color: CHART_COLORS.primary,
                points: toSeries(rsPoints),
              },
            ]}
            referenceLines={[
              { y: 0, color: CHART_COLORS.axis },
              { y: 1, label: 'Sharpe 1', color: CHART_COLORS.secondary },
            ]}
            emptyMessage="Not enough history for a rolling Sharpe chart."
          />
          <LineChart
            title={`Rolling beta vs ${benchLabel} (63 periods)`}
            ariaLabel="Rolling beta"
            series={[
              { id: 'rb', label: 'Beta', color: CHART_COLORS.tertiary, points: toSeries(rbPoints) },
            ]}
            referenceLines={[{ y: 1, label: 'Beta 1', color: CHART_COLORS.secondary }]}
            emptyMessage={
              benchAvailable
                ? 'Not enough overlapping history for rolling beta.'
                : 'Benchmark data unavailable.'
            }
          />
        </div>
      </ProOnly>
    </div>
  );
}

const datedPoints = PropTypes.arrayOf(
  PropTypes.shape({ date: PropTypes.string, value: PropTypes.number })
);

RiskSection.propTypes = {
  ccy: PropTypes.string,
  rfPct: PropTypes.number.isRequired,
  benchLabel: PropTypes.string.isRequired,
  benchAvailable: PropTypes.bool.isRequired,
  benchStatus: PropTypes.oneOf(['loading', 'ready', 'unavailable']).isRequired,
  returns: PropTypes.arrayOf(PropTypes.number).isRequired,
  closes: PropTypes.arrayOf(PropTypes.number).isRequired,
  ewmaSigma: PropTypes.number,
  dd: PropTypes.number,
  cal: PropTypes.number,
  srt: PropTypes.number,
  downDev: PropTypes.number,
  sharpeInfo: PropTypes.object,
  obs: PropTypes.number.isRequired,
  benchStats: PropTypes.object,
  ddStats: PropTypes.object,
  topDD: PropTypes.arrayOf(PropTypes.object).isRequired,
  ddPoints: datedPoints.isRequired,
  rsPoints: datedPoints.isRequired,
  rbPoints: datedPoints.isRequired,
};
