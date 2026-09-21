import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import { returnHistogram } from '../../quantUtils';
import { MetricCard } from '../charts';
import { MC_HORIZONS, MC_PATHS } from '../config';
import { fmtMoney as formatMoney } from '../numberFormat';
import { CHART_COLORS } from '../viz/chartTheme';
import { HistogramChart } from '../viz/HistogramChart';
import { LineChart } from '../viz/LineChart';

export function StochasticSection({
  sim,
  spot,
  ccy,
  seed,
  onReroll,
  onSeedChange,
  returnBins,
  horizon,
  onHorizonChange,
  horizonLabel,
  method,
  onMethodChange,
  drift,
  onDriftChange,
}) {
  const fmtMoney = (v) => formatMoney(v, ccy);
  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1">
        {[
          { id: 'gbm', label: 'GBM (normal)' },
          { id: 'bootstrap', label: 'Bootstrap (fat tails)' },
        ].map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onMethodChange(m.id)}
            className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
              method === m.id
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      {method === 'gbm' && (
        <div className="flex gap-1">
          {[
            { id: 'historical', label: 'Historical drift' },
            { id: 'riskneutral', label: 'Risk-neutral (rf)' },
          ].map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onDriftChange(d.id)}
              className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
                drift === d.id
                  ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                  : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        {MC_HORIZONS.map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onHorizonChange(h)}
            className={`rounded-none border px-2 py-1 text-[11px] tracking-wide ${
              horizon === h
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
            }`}
          >
            {h}d
          </button>
        ))}
      </div>
    </div>
  );
  if (!sim) {
    return (
      <div className="space-y-4">
        {controls}
        <NoticeBox title="Stochastic">Not enough price history to simulate.</NoticeBox>
      </div>
    );
  }
  const { percentiles, band, samplePaths, terminal } = sim;
  return (
    <div className="space-y-4">
      {controls}
      <p className="text-sm text-bloomberg-white/80">
        In 80% of {MC_PATHS.toLocaleString()} {method === 'bootstrap' ? 'block bootstrap' : 'GBM'}{' '}
        simulations, the price in {horizonLabel} landed between{' '}
        <span className="text-white">{fmtMoney(percentiles.p10)}</span> and{' '}
        <span className="text-white">{fmtMoney(percentiles.p90)}</span> (median{' '}
        <span className="text-white">{fmtMoney(percentiles.p50)}</span>). Today: {fmtMoney(spot)}.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onReroll}
          className="rounded-none border border-bloomberg-border px-3 py-1 text-xs tracking-wide text-bloomberg-muted hover:text-white"
        >
          Re-roll
        </button>
        <label className="text-[11px] text-bloomberg-muted">
          seed{' '}
          <input
            type="number"
            value={seed}
            onChange={(e) => onSeedChange(Number(e.target.value))}
            className="w-20 border border-bloomberg-border bg-black px-1 py-0.5 font-mono text-xs text-white"
          />
        </label>
        <span className="text-[11px] text-bloomberg-white/80">
          Same seed → same simulation. One possible future, not a prediction.
        </span>
      </div>

      <LineChart
        title={`Simulated price paths · ${horizonLabel}`}
        subtitle="Shaded band = 10th–90th percentile across all paths; faint lines = sample paths"
        ariaLabel="Monte Carlo price fan chart"
        xType="number"
        formatX={(d) => `+${Math.round(d)}d`}
        formatY={fmtMoney}
        series={[
          ...samplePaths.map((path, i) => ({
            id: `path-${i}`,
            color: 'rgba(229,229,229,0.18)',
            width: 1,
            hideInLegend: true,
            points: path.map((v, d) => ({ x: d, y: v })),
          })),
          {
            id: 'median',
            label: 'Median',
            color: CHART_COLORS.primary,
            width: 2,
            points: band.map((b) => ({ x: b.step, y: b.p50 })),
          },
        ]}
        bands={[
          {
            id: 'p10p90',
            label: 'P10–P90',
            color: CHART_COLORS.band,
            points: band.map((b) => ({ x: b.step, lo: b.p10, hi: b.p90 })),
          },
        ]}
        referenceLines={[{ y: spot, label: 'Today', color: CHART_COLORS.secondary }]}
      />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="10th pct (downside)" value={fmtMoney(percentiles.p10)} tone="bad" />
        <MetricCard label="Median outcome" value={fmtMoney(percentiles.p50)} />
        <MetricCard label="90th pct (upside)" value={fmtMoney(percentiles.p90)} tone="good" />
      </div>

      <HistogramChart
        title={`Simulated price distribution · ${horizonLabel}`}
        ariaLabel={`Histogram of simulated ${horizonLabel} prices`}
        bins={returnHistogram(terminal, 30)}
        formatX={fmtMoney}
        barLabel="Paths"
        markers={[{ x: spot, label: 'Today', color: CHART_COLORS.secondary }]}
      />
      <HistogramChart
        title="Historical daily returns"
        ariaLabel="Histogram of historical daily returns"
        bins={returnBins}
        formatX={(v) => `${(v * 100).toFixed(1)}%`}
      />
    </div>
  );
}

StochasticSection.propTypes = {
  sim: PropTypes.object,
  spot: PropTypes.number,
  ccy: PropTypes.string,
  seed: PropTypes.number.isRequired,
  onReroll: PropTypes.func.isRequired,
  onSeedChange: PropTypes.func.isRequired,
  returnBins: PropTypes.arrayOf(PropTypes.object).isRequired,
  horizon: PropTypes.number.isRequired,
  onHorizonChange: PropTypes.func.isRequired,
  horizonLabel: PropTypes.string.isRequired,
  method: PropTypes.oneOf(['gbm', 'bootstrap']).isRequired,
  onMethodChange: PropTypes.func.isRequired,
  drift: PropTypes.oneOf(['historical', 'riskneutral']).isRequired,
  onDriftChange: PropTypes.func.isRequired,
};

// --- new sections (Phase 4) -----------------------------------------------
