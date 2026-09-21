import PropTypes from 'prop-types';

import NoticeBox from '../../../NoticeBox';
import { MetricCard, SliderField } from '../charts';
import { STRATEGIES } from '../config';
import { fmtLoss, fmtPercent, fmtRatio, fmtSignedPct, ratioTone, signedTone } from '../format';
import { CHART_COLORS } from '../viz/chartTheme';
import { LineChart } from '../viz/LineChart';

// equity[k] / buyhold[k] belong to bar (result.startIndex + k) of the closes passed to backtest.
const datedPoints = (values, dates, startIndex) =>
  values.map((y, k) => ({ x: dates[startIndex + k], y }));

export function BacktestSection({
  strategy,
  onStrategyChange,
  params,
  onParamChange,
  result,
  dates,
}) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Canned long/flat strategies compared to buy &amp; hold over the same window (after the
        indicator warm-up). Costs are charged on every position change; flat days earn the risk-free
        rate. The optional out-of-sample split flags in-sample overfit. A sanity check, not a
        trading system.
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
              max={Math.min(50, params.slow - 1)}
              onChange={(v) => onParamChange('fast', v)}
            />
            <SliderField
              label="Slow SMA"
              value={params.slow}
              min={Math.max(20, params.fast + 1)}
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
          <LineChart
            title="Equity curve"
            subtitle="Growth of 1 unit over the evaluated window"
            ariaLabel="Strategy equity versus buy and hold"
            formatY={(v) => `${v.toFixed(2)}x`}
            series={[
              {
                id: 'buyhold',
                label: 'Buy & hold',
                color: CHART_COLORS.secondary,
                points: datedPoints(result.buyhold, dates, result.startIndex),
              },
              {
                id: 'strategy',
                label: 'Strategy',
                color: CHART_COLORS.primary,
                width: 2,
                points: datedPoints(result.equity, dates, result.startIndex),
              },
            ]}
            referenceLines={[{ y: 1, color: CHART_COLORS.axis }]}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
            <MetricCard
              label="Win Rate (per trade)"
              value={fmtPercent(result.winRate)}
              gloss="Share of round-trip trades that closed with a gain, costs included."
            />
            <MetricCard
              label="Daily Hit Rate"
              value={fmtPercent(result.hitRate)}
              gloss="Share of in-position days where the price rose."
            />
            <MetricCard label="Trades" value={String(result.trades)} />
          </div>
          {result.outSampleReturn != null && (
            <div className="grid grid-cols-2 gap-3">
              <MetricCard
                label="In-sample Return"
                value={fmtSignedPct(result.inSampleReturn)}
                tone={signedTone(result.inSampleReturn)}
                gloss="First 70% of the evaluated window — the part a tuned strategy can overfit."
              />
              <MetricCard
                label="Out-of-sample Return"
                value={fmtSignedPct(result.outSampleReturn)}
                tone={signedTone(result.outSampleReturn)}
                gloss="Trailing 30% the parameters never saw. A big drop here = overfit."
              />
            </div>
          )}
          <p className="text-[11px] text-bloomberg-white/80">
            Time in market: {fmtPercent(result.exposure)} · evaluation starts at bar{' '}
            {result.startIndex + 1} (indicator warm-up).
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
  dates: PropTypes.arrayOf(PropTypes.string).isRequired,
};
