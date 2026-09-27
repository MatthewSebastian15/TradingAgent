import PropTypes from 'prop-types';

import { MetricCard } from '../charts';
import {
  DASH,
  finite,
  fmtLoss,
  fmtNum2,
  fmtPercent,
  fmtRatio,
  fmtSignedPct,
  hurstLabel,
  ratioTone,
  sampleNote,
} from '../format';
import { interpretSummary } from '../interpret';
import { CARD_GRID } from '../layout';

const JUMPS = [
  { id: 'risk', label: 'Risk detail' },
  { id: 'volatility', label: 'Volatility detail' },
  { id: 'stochastic', label: 'Price forecast' },
  { id: 'backtest', label: 'Backtest' },
];

export function OverviewSection({
  symbol,
  vol,
  benchVol,
  regimeLabel,
  dd,
  benchMaxDD,
  currentDrawdown,
  underwaterDays,
  var95,
  sharpeInfo,
  benchStats,
  benchLabel,
  benchStatus,
  hurstInfo,
  observations,
  onNavigate,
}) {
  const summary = interpretSummary({
    symbol,
    vol,
    regimeLabel,
    currentDrawdown,
    underwaterDays,
    beta: benchStats?.beta,
    benchLabel,
    sharpe: sharpeInfo?.sharpe,
    sharpeTStat: sharpeInfo?.tStat,
    observations,
  });
  const benchCard = benchStatus === 'ready' && !benchStats ? 'unavailable' : benchStatus;
  const vsBench = (value, fmt) =>
    finite(value) ? { label: `vs ${benchLabel}`, value: fmt(value) } : undefined;

  return (
    <div className="space-y-4">
      <p
        data-testid="quant-summary"
        className="max-w-3xl text-sm leading-relaxed text-bloomberg-white"
      >
        {summary}
      </p>

      <div className={CARD_GRID}>
        <MetricCard
          label="Ann. Volatility"
          value={fmtPercent(vol)}
          compare={vsBench(benchVol, fmtPercent)}
          gloss="Standard deviation of daily returns, scaled to a year."
        />
        <MetricCard
          label="Sharpe"
          value={fmtRatio(sharpeInfo?.sharpe)}
          tone={ratioTone(sharpeInfo?.sharpe)}
          sample={sampleNote(sharpeInfo?.observations ?? observations)}
          gloss="Return above the risk-free rate per unit of volatility."
        />
        <MetricCard
          label="Max Drawdown"
          value={fmtLoss(dd)}
          tone="bad"
          compare={vsBench(benchMaxDD, fmtLoss)}
          gloss="Worst peak-to-trough fall in the window."
        />
        <MetricCard
          label="From Peak"
          value={finite(currentDrawdown) ? fmtLoss(currentDrawdown) : DASH}
          tone={currentDrawdown <= -1 ? 'bad' : 'neutral'}
          category={underwaterDays > 0 ? `${underwaterDays}d underwater` : 'At peak'}
          gloss="Distance of today's price below the highest close in the window."
        />
        <MetricCard
          label="VaR 95% (1D)"
          value={fmtLoss(var95)}
          tone="bad"
          gloss="On 1 day in 20, the daily loss was at least this large (historical)."
        />
        <MetricCard
          label={`Beta vs ${benchLabel}`}
          value={fmtNum2(benchStats?.beta)}
          status={benchCard}
          sample={benchStats ? sampleNote(benchStats.observations) : undefined}
          gloss="How much the stock moved per 1% move of the benchmark."
        />
        <MetricCard
          label="Alpha (ann.)"
          value={finite(benchStats?.alpha) ? fmtSignedPct(benchStats.alpha) : DASH}
          status={benchCard}
          category={
            finite(benchStats?.alphaTStat) ? `t = ${fmtNum2(benchStats.alphaTStat)}` : undefined
          }
          gloss="Return not explained by beta. |t| below 2 means not distinguishable from zero."
        />
        <MetricCard
          label="Hurst"
          value={fmtNum2(hurstInfo?.hurst)}
          category={hurstInfo ? hurstLabel(hurstInfo.hurst, hurstInfo.significant) : undefined}
          gloss="Above 0.5 trends, below 0.5 mean-reverts, near 0.5 behaves like a random walk."
        />
      </div>

      <nav aria-label="Go to section" className="flex flex-wrap gap-2">
        {JUMPS.map((jump) => (
          <button
            key={jump.id}
            type="button"
            onClick={() => onNavigate(jump.id)}
            className="rounded-none border border-bloomberg-border px-2.5 py-1 font-mono text-[11px] tracking-wider text-bloomberg-white/80 uppercase hover:border-bloomberg-orange hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          >
            {jump.label}
          </button>
        ))}
      </nav>
    </div>
  );
}

OverviewSection.propTypes = {
  symbol: PropTypes.string,
  vol: PropTypes.number,
  benchVol: PropTypes.number,
  regimeLabel: PropTypes.string,
  dd: PropTypes.number,
  benchMaxDD: PropTypes.number,
  currentDrawdown: PropTypes.number,
  underwaterDays: PropTypes.number,
  var95: PropTypes.number,
  sharpeInfo: PropTypes.object,
  benchStats: PropTypes.object,
  benchLabel: PropTypes.string.isRequired,
  benchStatus: PropTypes.oneOf(['loading', 'ready', 'unavailable']).isRequired,
  hurstInfo: PropTypes.object,
  observations: PropTypes.number,
  onNavigate: PropTypes.func.isRequired,
};
