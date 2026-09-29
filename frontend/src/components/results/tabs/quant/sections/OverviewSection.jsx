import { Copy, FileText } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import { useInRouterContext } from 'react-router-dom';

import { AskChatbotButton } from '../AskChatbotButton';
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
import { buildQuantSnapshot, chatbotPrompt, interpretSummary, snapshotText } from '../interpret';
import { CARD_GRID } from '../layout';
import { ProOnly } from '../mode';

const JUMPS = [
  { id: 'risk', label: 'Risk detail' },
  { id: 'volatility', label: 'Volatility detail' },
  { id: 'stochastic', label: 'Price forecast' },
  { id: 'backtest', label: 'Backtest' },
];

export function OverviewSection({
  symbol,
  windowLabel,
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
  onOpenReport,
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

  const inRouter = useInRouterContext();
  const [actionStatus, setActionStatus] = useState('');
  const snapshot = buildQuantSnapshot({
    symbol,
    windowLabel,
    summary,
    rows: [
      { label: 'Ann. Volatility', value: fmtPercent(vol) },
      { label: `${benchLabel} volatility`, value: finite(benchVol) ? fmtPercent(benchVol) : DASH },
      { label: 'Sharpe', value: fmtRatio(sharpeInfo?.sharpe) },
      { label: 'Max Drawdown', value: fmtLoss(dd) },
      { label: 'From Peak', value: finite(currentDrawdown) ? fmtLoss(currentDrawdown) : DASH },
      { label: 'VaR 95% (1D)', value: fmtLoss(var95) },
      { label: `Beta vs ${benchLabel}`, value: fmtNum2(benchStats?.beta) },
      {
        label: 'Alpha (ann.)',
        value: finite(benchStats?.alpha) ? fmtSignedPct(benchStats.alpha) : DASH,
      },
      { label: 'Hurst', value: fmtNum2(hurstInfo?.hurst) },
      { label: 'Observations', value: finite(observations) ? String(observations) : DASH },
    ],
  });

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(snapshotText(snapshot));
      setActionStatus('Summary copied.');
    } catch {
      setActionStatus('Copy is blocked in this browser — select the paragraph above instead.');
    }
  };

  const openReport = async () => {
    setActionStatus('Opening report…');
    try {
      await onOpenReport(snapshot);
      setActionStatus('');
    } catch (error) {
      setActionStatus(error?.message || 'The report could not be opened.');
    }
  };

  const ACTION =
    'inline-flex h-7 items-center gap-1.5 rounded-none border border-bloomberg-border px-2.5 font-mono text-[11px] tracking-wider text-bloomberg-white/80 uppercase hover:border-bloomberg-orange hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange';

  return (
    <div className="space-y-4">
      <p
        data-testid="quant-summary"
        className="max-w-3xl text-sm leading-relaxed text-bloomberg-white"
      >
        {summary}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copySummary} className={ACTION}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          Copy summary
        </button>
        {inRouter && <AskChatbotButton prompt={chatbotPrompt(snapshot)} className={ACTION} />}
        {onOpenReport && (
          <button type="button" onClick={openReport} className={ACTION}>
            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
            Report with quant
          </button>
        )}
        <span role="status" aria-live="polite" className="text-[11px] text-bloomberg-white/80">
          {actionStatus}
        </span>
      </div>

      <div className={CARD_GRID}>
        <MetricCard
          label="Ann. Volatility"
          value={fmtPercent(vol)}
          compare={vsBench(benchVol, fmtPercent)}
          gloss="Standard deviation of daily returns, scaled to a year."
        />
        <ProOnly>
          <MetricCard
            label="Sharpe"
            value={fmtRatio(sharpeInfo?.sharpe)}
            tone={ratioTone(sharpeInfo?.sharpe)}
            sample={sampleNote(sharpeInfo?.observations ?? observations)}
            gloss="Return above the risk-free rate per unit of volatility."
          />
        </ProOnly>
        <MetricCard
          label="Max Drawdown"
          value={fmtLoss(dd)}
          tone="bad"
          compare={vsBench(benchMaxDD, fmtLoss)}
          gloss="Worst peak-to-trough fall in the window."
        />
        <ProOnly>
          <MetricCard
            label="From Peak"
            value={finite(currentDrawdown) ? fmtLoss(currentDrawdown) : DASH}
            tone={currentDrawdown <= -1 ? 'bad' : 'neutral'}
            category={underwaterDays > 0 ? `${underwaterDays}d underwater` : 'At peak'}
            gloss="Distance of today's price below the highest close in the window."
          />
        </ProOnly>
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
        <ProOnly>
          <MetricCard
            label="Alpha (ann.)"
            value={finite(benchStats?.alpha) ? fmtSignedPct(benchStats.alpha) : DASH}
            status={benchCard}
            category={
              finite(benchStats?.alphaTStat) ? `t = ${fmtNum2(benchStats.alphaTStat)}` : undefined
            }
            gloss="Return not explained by beta. |t| below 2 means not distinguishable from zero."
          />
        </ProOnly>
        <ProOnly>
          <MetricCard
            label="Hurst"
            value={fmtNum2(hurstInfo?.hurst)}
            category={hurstInfo ? hurstLabel(hurstInfo.hurst, hurstInfo.significant) : undefined}
            gloss="Above 0.5 trends, below 0.5 mean-reverts, near 0.5 behaves like a random walk."
          />
        </ProOnly>
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
  windowLabel: PropTypes.string.isRequired,
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
  onOpenReport: PropTypes.func,
};
