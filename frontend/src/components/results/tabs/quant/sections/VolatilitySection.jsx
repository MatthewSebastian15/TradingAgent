import PropTypes from 'prop-types';

import { DASH, finite, fmtNum2, fmtPercent, volBucket } from '../format';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { LineChart } from '../viz/LineChart';

// Signed gap in percentage points, e.g. +2.1 pts / -3.1 pts.
const fmtPts = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`;
const pctAxis = (v) => `${v.toFixed(0)}%`;
const CONE_LINES = [
  { key: 'max', label: 'Max', color: CHART_COLORS.secondary, dashed: true },
  { key: 'p75', label: 'P75', color: CHART_COLORS.tertiary, dashed: false },
  { key: 'median', label: 'Median', color: CHART_COLORS.primary, dashed: false },
  { key: 'p25', label: 'P25', color: CHART_COLORS.quaternary, dashed: false },
  { key: 'min', label: 'Min', color: CHART_COLORS.secondary, dashed: true },
];
const toXY = (pts) => pts.map((p) => ({ x: p.date, y: p.value }));
const contentText = () => 'text-bloomberg-white/80';

export function VolatilitySection({
  vol,
  ewma,
  ppy = 252,
  estimators,
  cone,
  garch,
  garchTerm,
  rollingPoints,
  rolling63Points,
  ewmaPoints,
}) {
  const garch21 = garchTerm.find((t) => t.days === 21);
  const longRunVol = garch ? Math.sqrt(garch.longRunVariance * ppy) * 100 : null;
  const shockHalfLife =
    garch && garch.persistence > 0 && garch.persistence < 1
      ? Math.log(0.5) / Math.log(garch.persistence)
      : null;

  const estimatorRows = [
    {
      name: 'Close-to-close',
      value: vol,
      uses: 'Close',
      note: `Stdev of daily returns × √${ppy}; matches the server risk summary.`,
    },
    {
      name: 'EWMA (λ = 0.94)',
      value: ewma,
      uses: 'Close',
      note: 'Recent days weighted more; reacts fastest to new calm or stress.',
    },
    {
      name: 'Parkinson',
      value: estimators.parkinson,
      uses: 'High, low',
      note: 'Intraday range; efficient but blind to overnight gaps.',
    },
    {
      name: 'Garman-Klass',
      value: estimators.garmanKlass,
      uses: 'OHLC',
      note: 'Adds open/close to the range; still ignores gaps.',
    },
    {
      name: 'Yang-Zhang',
      value: estimators.yangZhang,
      uses: 'OHLC + prior close',
      note: 'Handles overnight gaps and drift; best all-round.',
    },
    {
      name: 'GARCH(1,1) · next 21d',
      value: garch21 ? garch21.annualVol : null,
      uses: 'Close',
      note: garch
        ? `Forecast mean-reverting toward ${fmtPercent(longRunVol)}.`
        : 'Needs at least 100 daily returns.',
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Vol level (absolute scale): <span className="text-white">{volBucket(vol)}</span> —
        close-to-close volatility is {fmtPercent(vol)}. Range estimators use intraday highs and
        lows, so they converge faster; large gaps between them and close-to-close usually mean
        overnight jumps. The headline &quot;Vol Regime&quot; compares today with this name&apos;s
        own history instead.
      </p>

      <DataTable
        caption="Volatility estimators · annualized"
        rowKey={(r) => r.name}
        rows={estimatorRows}
        columns={[
          { key: 'name', label: 'Estimator' },
          { key: 'value', label: 'Annualized', align: 'right', render: (r) => fmtPercent(r.value) },
          { key: 'uses', label: 'Uses' },
          { key: 'note', label: 'Note', className: contentText },
        ]}
      />

      <LineChart
        title="Rolling volatility"
        subtitle="Annualized realized vol over sliding windows"
        ariaLabel="Rolling volatility"
        formatY={pctAxis}
        series={[
          {
            id: 'r21',
            label: '21-day',
            color: CHART_COLORS.primary,
            points: toXY(rollingPoints),
          },
          {
            id: 'r63',
            label: '63-day',
            color: CHART_COLORS.tertiary,
            points: toXY(rolling63Points),
          },
          {
            id: 'ewma',
            label: 'EWMA',
            color: CHART_COLORS.quaternary,
            dashed: true,
            points: toXY(ewmaPoints),
          },
        ]}
        referenceLines={
          finite(vol) ? [{ y: vol, label: 'Full period', color: CHART_COLORS.secondary }] : []
        }
        includeZero
        emptyMessage="Not enough history for rolling volatility."
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <LineChart
          title="Volatility cone · realized vol by window"
          subtitle="Lines = historical distribution; amber dots = today"
          ariaLabel="Volatility cone"
          xType="number"
          formatX={(v) => `${Math.round(v)}d`}
          formatY={pctAxis}
          series={CONE_LINES.map((line) => ({
            id: line.key,
            label: line.label,
            color: line.color,
            dashed: line.dashed,
            points: cone.map((c) => ({ x: c.window, y: c[line.key] })),
          }))}
          markers={cone.map((c) => ({
            x: c.window,
            y: c.current,
            shape: 'dot',
            color: CHART_COLORS.warning,
            label: `Current ${c.window}d: ${fmtPercent(c.current)}`,
          }))}
          includeZero
          emptyMessage="Need at least two windows of history for a vol cone."
        />
        <DataTable
          caption="Cone detail"
          rowKey={(r) => String(r.window)}
          rows={cone}
          columns={[
            { key: 'window', label: 'Window', render: (r) => `${r.window}d` },
            { key: 'min', label: 'Min', align: 'right', render: (r) => fmtPercent(r.min) },
            { key: 'median', label: 'Median', align: 'right', render: (r) => fmtPercent(r.median) },
            { key: 'max', label: 'Max', align: 'right', render: (r) => fmtPercent(r.max) },
            {
              key: 'current',
              label: 'Current',
              align: 'right',
              render: (r) => fmtPercent(r.current),
            },
            {
              key: 'percentile',
              label: 'Pctile',
              align: 'right',
              render: (r) => r.percentile.toFixed(0),
            },
          ]}
        />
      </div>

      <DataTable
        caption="GARCH(1,1) term structure"
        rowKey={(r) => String(r.days)}
        rows={garchTerm}
        emptyMessage="GARCH needs at least 100 daily returns."
        columns={[
          { key: 'days', label: 'Horizon', render: (r) => `${r.days}d` },
          {
            key: 'annualVol',
            label: 'Avg forecast vol',
            align: 'right',
            render: (r) => fmtPercent(r.annualVol),
          },
          {
            key: 'vsLong',
            label: 'vs long run',
            align: 'right',
            render: (r) => (finite(longRunVol) ? fmtPts(r.annualVol - longRunVol) : DASH),
          },
        ]}
      />
      {garch && (
        <p className="text-[11px] text-bloomberg-white/80">
          α = {fmtNum2(garch.alpha)}, β = {fmtNum2(garch.beta)}, persistence{' '}
          {fmtNum2(garch.persistence)}
          {finite(shockHalfLife)
            ? ` · a volatility shock halves in ~${shockHalfLife.toFixed(0)} days`
            : ''}
          . Grid-search fit on {garch.observations} returns; treat as a guide, not a precise
          forecast.
        </p>
      )}
    </div>
  );
}

const datedPoints = PropTypes.arrayOf(
  PropTypes.shape({ date: PropTypes.string, value: PropTypes.number })
);

VolatilitySection.propTypes = {
  vol: PropTypes.number,
  ewma: PropTypes.number,
  ppy: PropTypes.number,
  estimators: PropTypes.shape({
    parkinson: PropTypes.number,
    garmanKlass: PropTypes.number,
    yangZhang: PropTypes.number,
  }).isRequired,
  cone: PropTypes.arrayOf(PropTypes.object).isRequired,
  garch: PropTypes.object,
  garchTerm: PropTypes.arrayOf(
    PropTypes.shape({ days: PropTypes.number, annualVol: PropTypes.number })
  ).isRequired,
  rollingPoints: datedPoints.isRequired,
  rolling63Points: datedPoints.isRequired,
  ewmaPoints: datedPoints.isRequired,
};
