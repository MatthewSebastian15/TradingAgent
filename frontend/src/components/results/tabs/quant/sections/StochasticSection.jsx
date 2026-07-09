import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import { returnHistogram } from '../../quantUtils';
import { FanChart, Histogram, MetricCard } from '../charts';
import { MC_HORIZONS, MC_PATHS } from '../config';

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
  const fmtMoney = (v) => `${ccy ? `${ccy} ` : '$'}${Number(v).toFixed(2)}`;
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
      <p className="text-sm text-bloomberg-subtle">
        In 80% of {MC_PATHS.toLocaleString()} {method === 'bootstrap' ? 'bootstrap' : 'GBM'}{' '}
        simulations, the price in {horizonLabel} landed between{' '}
        <span className="text-white">{fmtMoney(percentiles.p10)}</span> and{' '}
        <span className="text-white">{fmtMoney(percentiles.p90)}</span> (median{' '}
        <span className="text-white">{fmtMoney(percentiles.p50)}</span>). Today: {fmtMoney(spot)}.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onReroll}
          className="rounded-full border border-bloomberg-border px-3 py-1 text-xs tracking-wide text-bloomberg-muted hover:text-white"
        >
          🎲 Re-roll
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
        <span className="text-[11px] text-bloomberg-subtle">
          Same seed → same simulation. One possible future, not a prediction.
        </span>
      </div>

      <FanChart band={band} samplePaths={samplePaths} />

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="10th pct (downside)" value={fmtMoney(percentiles.p10)} tone="bad" />
        <MetricCard label="Median outcome" value={fmtMoney(percentiles.p50)} />
        <MetricCard label="90th pct (upside)" value={fmtMoney(percentiles.p90)} tone="good" />
      </div>

      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Simulated price distribution
        </div>
        <Histogram
          bins={returnHistogram(terminal, 30)}
          label={`Histogram of simulated ${horizonLabel} prices`}
        />
      </div>

      <div className="space-y-1">
        <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
          Historical daily return distribution
        </div>
        <Histogram bins={returnBins} label="Histogram of historical daily returns" />
      </div>
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
