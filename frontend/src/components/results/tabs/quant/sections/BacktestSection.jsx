import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import { DualLineChart, MetricCard, SliderField } from '../charts';
import { STRATEGIES } from '../config';
import { fmtLoss, fmtPercent, fmtRatio, fmtSignedPct, ratioTone, signedTone } from '../format';

export function BacktestSection({ strategy, onStrategyChange, params, onParamChange, result }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-subtle">
        Canned long/flat strategies on this price series, compared to buy &amp; hold. Transaction
        cost is modeled per position flip; the optional out-of-sample split flags in-sample overfit.
        Still a sanity check, not a trading system.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STRATEGIES.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onStrategyChange(s.id)}
              className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
                strategy === s.id
                  ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                  : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onParamChange('oosFrac', params.oosFrac > 0 ? 0 : 0.3)}
          className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
            params.oosFrac > 0
              ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
              : 'border-bloomberg-border text-bloomberg-muted hover:text-white'
          }`}
        >
          Out-of-sample 30%
        </button>
      </div>
      <div className="flex flex-wrap gap-4">
        {strategy === 'sma' && (
          <>
            <SliderField
              label="Fast SMA"
              value={params.fast}
              min={5}
              max={50}
              onChange={(v) => onParamChange('fast', v)}
            />
            <SliderField
              label="Slow SMA"
              value={params.slow}
              min={20}
              max={200}
              onChange={(v) => onParamChange('slow', v)}
            />
          </>
        )}
        {strategy === 'momentum' && (
          <SliderField
            label="Lookback (days)"
            value={params.lookback}
            min={10}
            max={200}
            onChange={(v) => onParamChange('lookback', v)}
          />
        )}
        {strategy === 'meanrev' && (
          <SliderField
            label="SMA window"
            value={params.lookback}
            min={5}
            max={100}
            onChange={(v) => onParamChange('mrLookback', v)}
          />
        )}
        <SliderField
          label="Cost / trade (bps)"
          value={params.costBps}
          min={0}
          max={50}
          onChange={(v) => onParamChange('costBps', v)}
        />
      </div>
      {!result ? (
        <NoticeBox title="Backtest">Not enough price history to backtest.</NoticeBox>
      ) : (
        <>
          <DualLineChart
            a={result.equity}
            b={result.buyhold}
            label="Strategy equity (orange) vs buy & hold (grey)"
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <MetricCard
              label="Strategy Return"
              value={fmtSignedPct(result.finalReturn)}
              tone={signedTone(result.finalReturn)}
            />
            <MetricCard
              label="Buy & Hold"
              value={fmtSignedPct(result.buyHoldReturn)}
              tone={signedTone(result.buyHoldReturn)}
            />
            <MetricCard
              label="CAGR"
              value={fmtSignedPct(result.cagr)}
              tone={signedTone(result.cagr)}
            />
            <MetricCard
              label="Sharpe"
              value={fmtRatio(result.sharpe)}
              tone={ratioTone(result.sharpe)}
            />
            <MetricCard label="Max Drawdown" value={fmtLoss(result.maxDD)} tone="bad" />
            <MetricCard label="Win Rate" value={fmtPercent(result.winRate)} />
          </div>
          {result.outSampleReturn != null && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <MetricCard
                label="In-sample Return"
                value={fmtSignedPct(result.inSampleReturn)}
                tone={signedTone(result.inSampleReturn)}
                gloss="First 70% of history — the part a tuned strategy can overfit."
              />
              <MetricCard
                label="Out-of-sample Return"
                value={fmtSignedPct(result.outSampleReturn)}
                tone={signedTone(result.outSampleReturn)}
                gloss="Trailing 30% the parameters never saw. A big drop here = overfit."
              />
              <MetricCard label="Trades" value={String(result.trades)} />
            </div>
          )}
          <p className="text-[11px] text-bloomberg-subtle">
            Time in market: {fmtPercent(result.exposure)}
            {result.outSampleReturn == null ? ` · ${result.trades} trades` : ''}.
          </p>
        </>
      )}
    </div>
  );
}

BacktestSection.propTypes = {
  strategy: PropTypes.string.isRequired,
  onStrategyChange: PropTypes.func.isRequired,
  params: PropTypes.object.isRequired,
  onParamChange: PropTypes.func.isRequired,
  result: PropTypes.object,
};
