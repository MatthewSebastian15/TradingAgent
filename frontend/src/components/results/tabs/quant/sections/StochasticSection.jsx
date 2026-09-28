import { Dices } from 'lucide-react';
import PropTypes from 'prop-types';
import { useMemo } from 'react';

import NoticeBox from '../../../NoticeBox';
import { futureTradingDates, returnHistogram } from '../../quantUtils';
import { AdvancedPanel } from '../AdvancedPanel';
import { MetricCard, NumberField } from '../charts';
import { MC_HORIZONS, MC_PATHS } from '../config';
import { finite, fmtLoss, fmtPercent, fmtSignedPct, signedTone } from '../format';
import { CARD_GRID, FIELD_GRID } from '../layout';
import { fmtMoney as formatMoney } from '../numberFormat';
import { SegmentedControl } from '../SegmentedControl';
import { CHART_COLORS } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { HistogramChart } from '../viz/HistogramChart';
import { LineChart } from '../viz/LineChart';

const OUTCOMES = ['p5', 'p10', 'p25', 'p50', 'p75', 'p90', 'p95'];

export function StochasticSection({
  sim,
  running,
  spot,
  ccy,
  lastDate,
  ppy,
  seed,
  onReroll,
  onSeedChange,
  horizon,
  onHorizonChange,
  horizonLabel,
  method,
  onMethodChange,
  drift,
  onDriftChange,
  bootDemean,
  onBootDemeanChange,
  target,
  onTargetChange,
  stop,
  onStopChange,
  sigmaInfo,
  returnBins,
}) {
  const fmtMoney = (v) => formatMoney(v, ccy);
  const dates = useMemo(
    () => [lastDate, ...futureTradingDates(lastDate, horizon, ppy)],
    [lastDate, horizon, ppy]
  );

  const controls = (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Simulation method"
          options={[
            { id: 'gbm', label: 'GBM (normal)' },
            { id: 'bootstrap', label: 'Bootstrap (fat tails)' },
          ]}
          value={method}
          onChange={onMethodChange}
        />
        {method === 'gbm' ? (
          <SegmentedControl
            ariaLabel="Drift"
            options={[
              { id: 'historical', label: 'Historical drift' },
              { id: 'riskneutral', label: 'Risk-neutral (rf)' },
            ]}
            value={drift}
            onChange={onDriftChange}
          />
        ) : (
          <SegmentedControl
            ariaLabel="Bootstrap drift"
            options={[
              { id: 'historical', label: 'Historical drift' },
              { id: 'demeaned', label: 'Demeaned' },
            ]}
            value={bootDemean ? 'demeaned' : 'historical'}
            onChange={(id) => onBootDemeanChange(id === 'demeaned')}
          />
        )}
        <SegmentedControl
          ariaLabel="Horizon"
          options={MC_HORIZONS.map((h) => ({ id: h, label: `${h}d` }))}
          value={horizon}
          onChange={onHorizonChange}
        />
      </div>
      <div className={FIELD_GRID}>
        <NumberField
          label="Target price"
          value={target}
          onChange={onTargetChange}
          suffix={ccy || 'ccy'}
        />
        <NumberField
          label="Stop price"
          value={stop}
          onChange={onStopChange}
          suffix={ccy || 'ccy'}
        />
        <AdvancedPanel>
          <div className="flex flex-wrap items-center gap-3 text-bloomberg-white/80">
            <label className="flex items-center gap-2">
              Seed
              <input
                type="number"
                value={seed}
                onChange={(e) => onSeedChange(Number(e.target.value))}
                className="h-7 w-20 rounded-none border border-bloomberg-border bg-black px-1 text-xs text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
              />
            </label>
            <button
              type="button"
              onClick={onReroll}
              className="rounded-none border border-bloomberg-border px-3 py-1 text-xs text-bloomberg-white/80 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
            >
              <span className="inline-flex items-center gap-1.5">
                <Dices className="h-3.5 w-3.5" aria-hidden="true" />
                Re-roll
              </span>
            </button>
            <span>Same seed → same simulation.</span>
          </div>
        </AdvancedPanel>
      </div>
      <div role="status" aria-live="polite" className="h-4 text-[11px] text-bloomberg-amber">
        {running ? 'Simulating…' : ''}
      </div>
    </div>
  );

  if (!sim) {
    return (
      <div className="space-y-4">
        {controls}
        {!running && (
          <NoticeBox title="Stochastic">Not enough price history to simulate.</NoticeBox>
        )}
      </div>
    );
  }

  const { percentiles: p, band, samplePaths, terminal } = sim;
  const dateAt = (step) => dates[step] || dates.at(-1);
  const annualSigma = finite(sigmaInfo?.sigma) ? sigmaInfo.sigma * Math.sqrt(ppy) * 100 : null;
  const referenceLines = [
    { y: spot, label: 'Today', color: CHART_COLORS.secondary },
    finite(Number(target)) &&
      target !== '' && { y: Number(target), label: 'Target', color: CHART_COLORS.up },
    finite(Number(stop)) &&
      stop !== '' && { y: Number(stop), label: 'Stop', color: CHART_COLORS.down },
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      {controls}
      <p className="text-sm text-bloomberg-white/80">
        In 90% of {MC_PATHS.toLocaleString()} {method === 'bootstrap' ? 'bootstrap' : 'GBM'} paths
        the price in {horizonLabel} ends between{' '}
        <span className="text-white">{fmtMoney(p.p5)}</span> and{' '}
        <span className="text-white">{fmtMoney(p.p95)}</span> (median{' '}
        <span className="text-white">{fmtMoney(p.p50)}</span>). Today: {fmtMoney(spot)}. One set of
        possible futures, not a prediction.
      </p>
      {method === 'gbm' && finite(annualSigma) && (
        <p className="text-[11px] text-bloomberg-white/80">
          σ used: {fmtPercent(annualSigma)} annualized (
          {sigmaInfo.source === 'garch'
            ? 'GARCH forecast averaged over the horizon'
            : 'EWMA blended toward long-run vol'}
          ).
        </p>
      )}

      <LineChart
        title={`Simulated price paths · ${horizonLabel}`}
        subtitle="Outer band P5–P95, inner band P25–P75; faint lines are sample paths"
        ariaLabel="Monte Carlo price fan chart"
        formatY={fmtMoney}
        series={[
          ...samplePaths.map((path, i) => ({
            id: `path-${i}`,
            color: 'rgba(229,229,229,0.16)',
            width: 1,
            hideInLegend: true,
            points: path.map((v, d) => ({ x: dateAt(d), y: v })),
          })),
          {
            id: 'median',
            label: 'Median',
            color: CHART_COLORS.primary,
            width: 2,
            points: band.map((b) => ({ x: dateAt(b.step), y: b.p50 })),
          },
        ]}
        bands={[
          {
            id: 'outer',
            label: 'P5–P95',
            color: CHART_COLORS.band,
            points: band.map((b) => ({ x: dateAt(b.step), lo: b.p5, hi: b.p95 })),
          },
          {
            id: 'inner',
            label: 'P25–P75',
            color: CHART_COLORS.bandInner,
            points: band.map((b) => ({ x: dateAt(b.step), lo: b.p25, hi: b.p75 })),
          },
        ]}
        referenceLines={referenceLines}
      />

      <div className={CARD_GRID}>
        <MetricCard
          label="P(below today)"
          value={fmtPercent(sim.probBelowSpot * 100)}
          gloss="Share of paths ending under today's price."
        />
        <MetricCard
          label="P(touch target)"
          value={sim.probTarget == null ? '—' : fmtPercent(sim.probTarget * 100)}
          gloss="Paths that reach the target at any point."
        />
        <MetricCard
          label="P(touch stop)"
          value={sim.probStop == null ? '—' : fmtPercent(sim.probStop * 100)}
          gloss="Paths that hit the stop at any point."
        />
        <MetricCard
          label="Expected return"
          value={fmtSignedPct(sim.expectedReturnPct)}
          tone={signedTone(sim.expectedReturnPct)}
          gloss="Mean terminal price vs today."
        />
        <MetricCard
          label="Median max drawdown"
          value={fmtLoss(sim.maxDrawdownMedian)}
          tone="bad"
          gloss="Typical worst dip along a path."
        />
        <MetricCard
          label="Worst-10% drawdown"
          value={fmtLoss(sim.maxDrawdownWorst10)}
          tone="bad"
          gloss="1 path in 10 dips at least this far."
        />
      </div>

      <DataTable
        caption={`Outcome distribution · ${horizonLabel}`}
        rowKey={(r) => r.key}
        rows={OUTCOMES.map((key) => ({ key, price: p[key], ret: (p[key] / spot - 1) * 100 }))}
        columns={[
          { key: 'key', label: 'Percentile', render: (r) => r.key.toUpperCase() },
          { key: 'price', label: 'Price', align: 'right', render: (r) => fmtMoney(r.price) },
          {
            key: 'ret',
            label: 'vs today',
            align: 'right',
            render: (r) => fmtSignedPct(r.ret),
            className: (r) => (r.ret < 0 ? 'text-bloomberg-red' : 'text-bloomberg-green'),
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
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
    </div>
  );
}

const numOrEmpty = PropTypes.oneOfType([PropTypes.number, PropTypes.string]);

StochasticSection.propTypes = {
  sim: PropTypes.object,
  running: PropTypes.bool.isRequired,
  spot: PropTypes.number,
  ccy: PropTypes.string,
  lastDate: PropTypes.string.isRequired,
  ppy: PropTypes.number.isRequired,
  seed: PropTypes.number.isRequired,
  onReroll: PropTypes.func.isRequired,
  onSeedChange: PropTypes.func.isRequired,
  horizon: PropTypes.number.isRequired,
  onHorizonChange: PropTypes.func.isRequired,
  horizonLabel: PropTypes.string.isRequired,
  method: PropTypes.oneOf(['gbm', 'bootstrap']).isRequired,
  onMethodChange: PropTypes.func.isRequired,
  drift: PropTypes.oneOf(['historical', 'riskneutral']).isRequired,
  onDriftChange: PropTypes.func.isRequired,
  bootDemean: PropTypes.bool.isRequired,
  onBootDemeanChange: PropTypes.func.isRequired,
  target: numOrEmpty.isRequired,
  onTargetChange: PropTypes.func.isRequired,
  stop: numOrEmpty.isRequired,
  onStopChange: PropTypes.func.isRequired,
  sigmaInfo: PropTypes.shape({ sigma: PropTypes.number, source: PropTypes.string }),
  returnBins: PropTypes.arrayOf(PropTypes.object).isRequired,
};
