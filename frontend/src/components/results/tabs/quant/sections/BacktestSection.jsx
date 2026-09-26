import PropTypes from 'prop-types';
import { useEffect, useMemo, useState } from 'react';

import NoticeBox from '../../../NoticeBox';
import {
  drawdownSeries,
  parameterSweep,
  seriesStats,
  simpleReturns,
  tradeStats,
  walkForward,
} from '../../quantUtils';
import { MetricCard, SliderField } from '../charts';
import { STRATEGIES } from '../config';
import {
  DASH,
  finite,
  fmtLoss,
  fmtNum2,
  fmtPercent,
  fmtRatio,
  fmtSignedPct,
  ratioTone,
  signedTone,
} from '../format';
import { CARD_GRID, FIELD_GRID } from '../layout';
import { SegmentedControl } from '../SegmentedControl';
import { CHART_COLORS, divergingColor, textOnDiverging } from '../viz/chartTheme';
import { DataTable } from '../viz/DataTable';
import { Heatmap } from '../viz/Heatmap';
import { LineChart } from '../viz/LineChart';

const MAX_MARKED_TRADES = 60;
const paramsLabel = (strategy, p) =>
  strategy === 'sma' ? `${p.fast}/${p.slow}` : `${p.lookback}d`;
const signedClass = (v) =>
  v > 0 ? 'text-bloomberg-green' : v < 0 ? 'text-bloomberg-red' : 'text-bloomberg-white';

const COMPARISON = [
  { key: 'totalReturn', label: 'Total return', fmt: fmtSignedPct },
  { key: 'cagr', label: 'CAGR', fmt: fmtSignedPct },
  { key: 'vol', label: 'Volatility', fmt: fmtPercent },
  { key: 'sharpe', label: 'Sharpe', fmt: fmtRatio },
  { key: 'sortino', label: 'Sortino', fmt: fmtRatio },
  { key: 'maxDD', label: 'Max drawdown', fmt: fmtLoss },
  { key: 'calmar', label: 'Calmar', fmt: fmtRatio },
];

export function BacktestSection({
  strategy,
  onStrategyChange,
  params,
  onParamChange,
  onApplyParams,
  result,
  dates,
  closes,
  rf,
  ppy,
}) {
  const [logScale, setLogScale] = useState(false);
  const [robust, setRobust] = useState({ status: 'idle' });

  useEffect(() => {
    setRobust({ status: 'idle' });
  }, [strategy, closes]);

  const detail = useMemo(() => {
    if (!result) return null;
    const at = (absIndex) => dates[absIndex];
    const equityAt = (absIndex) => result.equity[absIndex - result.startIndex];
    const years = (result.equity.length - 1) / ppy;
    const markers = result.tradeList.slice(-MAX_MARKED_TRADES).flatMap((t) => [
      {
        x: at(t.entryIndex),
        y: equityAt(t.entryIndex),
        shape: 'up',
        color: CHART_COLORS.up,
        label: `Entry ${at(t.entryIndex)}`,
      },
      ...(t.open
        ? []
        : [
            {
              x: at(t.exitIndex),
              y: equityAt(t.exitIndex),
              shape: 'down',
              color: CHART_COLORS.down,
              label: `Exit ${at(t.exitIndex)} · ${fmtSignedPct(t.ret)}`,
            },
          ]),
    ]);
    return {
      strat: seriesStats(result.equity, result.returns, rf, ppy),
      hold: seriesStats(result.buyhold, simpleReturns(result.buyhold), rf, ppy),
      trades: tradeStats(result.tradeList, years),
      markers,
      drawdown: drawdownSeries(result.equity).map((v, k) => ({
        x: dates[result.startIndex + k],
        y: v,
      })),
      recent: result.tradeList.slice(-20).reverse(),
    };
  }, [result, dates, rf, ppy]);

  const runRobustness = () => {
    setRobust({ status: 'running' });
    setTimeout(() => {
      setRobust({
        status: 'done',
        sweep: parameterSweep(closes, strategy, params, rf, ppy),
        wf: walkForward(closes, strategy, params, { rf, ppy }),
      });
    }, 0);
  };

  const sweep = robust.sweep;
  const sweepValues = sweep
    ? sweep.cells.map((row) => row.map((c) => (c && finite(c.sharpe) ? c.sharpe : null)))
    : [];
  const sweepMax = Math.max(0.5, ...sweepValues.flat().filter(finite).map(Math.abs));
  const currentRow = sweep ? sweep.rowValues.indexOf(params[sweep.rowKey]) : -1;
  const currentCol = sweep && sweep.colKey ? sweep.colValues.indexOf(params[sweep.colKey]) : 0;

  return (
    <div className="space-y-4">
      <p className="text-sm text-bloomberg-white/80">
        Canned long/flat strategies compared to buy &amp; hold over the same window (after the
        indicator warm-up). Costs are charged on every position change; flat days earn the risk-free
        rate. A sanity check, not a trading system.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl
          ariaLabel="Strategy"
          options={STRATEGIES}
          value={strategy}
          onChange={onStrategyChange}
        />
        <button
          type="button"
          aria-pressed={params.oosFrac > 0}
          onClick={() => onParamChange('oosFrac', params.oosFrac > 0 ? 0 : 0.3)}
          className={`rounded-none border px-2.5 py-1 text-[11px] tracking-wide ${
            params.oosFrac > 0
              ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
              : 'border-bloomberg-border text-bloomberg-white/80 hover:text-white'
          }`}
        >
          Out-of-sample 30%
        </button>
      </div>

      <div className={FIELD_GRID}>
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

      {!result || !detail ? (
        <NoticeBox title="Backtest">
          Not enough price history after the indicator warm-up to backtest.
        </NoticeBox>
      ) : (
        <>
          <div className="flex items-center justify-end">
            <button
              type="button"
              aria-pressed={logScale}
              onClick={() => setLogScale((v) => !v)}
              className={`rounded-none border px-2.5 py-1 text-[11px] ${
                logScale
                  ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                  : 'border-bloomberg-border text-bloomberg-white/80 hover:text-white'
              }`}
            >
              Log scale
            </button>
          </div>
          <LineChart
            title="Equity curve"
            subtitle="Growth of 1 unit · ▲ entry ▼ exit (last 60 trades)"
            ariaLabel="Strategy equity versus buy and hold"
            yScaleType={logScale ? 'log' : 'linear'}
            formatY={(v) => `${v.toFixed(2)}x`}
            series={[
              {
                id: 'buyhold',
                label: 'Buy & hold',
                color: CHART_COLORS.secondary,
                points: result.buyhold.map((v, k) => ({ x: dates[result.startIndex + k], y: v })),
              },
              {
                id: 'strategy',
                label: 'Strategy',
                color: CHART_COLORS.primary,
                width: 2,
                points: result.equity.map((v, k) => ({ x: dates[result.startIndex + k], y: v })),
              },
            ]}
            referenceLines={[{ y: 1, color: CHART_COLORS.axis }]}
            markers={detail.markers}
          />
          <LineChart
            title="Strategy drawdown"
            ariaLabel="Strategy drawdown"
            height={160}
            formatY={(v) => `${v.toFixed(0)}%`}
            includeZero
            series={[
              { id: 'dd', label: 'Drawdown', color: CHART_COLORS.down, points: detail.drawdown },
            ]}
          />

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <DataTable
              caption="Strategy vs buy & hold"
              rowKey={(r) => r.key}
              rows={COMPARISON}
              columns={[
                { key: 'label', label: 'Metric' },
                {
                  key: 'strategy',
                  label: 'Strategy',
                  align: 'right',
                  render: (r) => r.fmt(detail.strat?.[r.key]),
                },
                {
                  key: 'hold',
                  label: 'Buy & hold',
                  align: 'right',
                  render: (r) => r.fmt(detail.hold?.[r.key]),
                },
              ]}
            />
            <div className={CARD_GRID}>
              <MetricCard
                label="Win Rate (per trade)"
                value={fmtPercent(detail.trades.winRate)}
                gloss="Round trips closed with a gain, costs included."
              />
              <MetricCard
                label="Daily Hit Rate"
                value={fmtPercent(result.hitRate)}
                gloss="In-position days where the price rose."
              />
              <MetricCard
                label="Profit Factor"
                value={fmtNum2(detail.trades.profitFactor)}
                tone={ratioTone(detail.trades.profitFactor)}
                gloss="Sum of winning % ÷ sum of losing %."
              />
              <MetricCard
                label="Avg Win / Loss"
                value={`${fmtSignedPct(detail.trades.avgWin)} / ${fmtSignedPct(detail.trades.avgLoss)}`}
              />
              <MetricCard
                label="Avg Hold"
                value={
                  finite(detail.trades.avgHoldDays)
                    ? `${detail.trades.avgHoldDays.toFixed(0)}d`
                    : DASH
                }
              />
              <MetricCard
                label="Turnover"
                value={
                  finite(detail.trades.turnoverPerYear)
                    ? `${detail.trades.turnoverPerYear.toFixed(1)}/yr`
                    : DASH
                }
                gloss={`${detail.trades.trades} trades · time in market ${fmtPercent(result.exposure)}`}
              />
            </div>
          </div>

          {result.outSampleReturn != null && (
            <div className={CARD_GRID}>
              <MetricCard
                label="In-sample Return"
                value={fmtSignedPct(result.inSampleReturn)}
                tone={signedTone(result.inSampleReturn)}
                gloss="First 70% of the evaluated window."
              />
              <MetricCard
                label="Out-of-sample Return"
                value={fmtSignedPct(result.outSampleReturn)}
                tone={signedTone(result.outSampleReturn)}
                gloss="Trailing 30%. A big drop here = overfit."
              />
            </div>
          )}

          <DataTable
            caption="Recent trades"
            rowKey={(r) => `${r.entryIndex}`}
            rows={detail.recent}
            maxHeightClass="max-h-72"
            emptyMessage="No trades in this window."
            columns={[
              { key: 'entry', label: 'Entry', render: (r) => dates[r.entryIndex] },
              { key: 'exit', label: 'Exit', render: (r) => (r.open ? 'Open' : dates[r.exitIndex]) },
              { key: 'days', label: 'Days', align: 'right' },
              {
                key: 'ret',
                label: 'Return',
                align: 'right',
                render: (r) => fmtSignedPct(r.ret),
                className: (r) => signedClass(r.ret),
              },
            ]}
          />

          <div className="space-y-3 border border-bloomberg-border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs tracking-wider text-bloomberg-orange uppercase">
                Robustness
              </div>
              <button
                type="button"
                onClick={runRobustness}
                disabled={robust.status === 'running'}
                className="rounded-none border border-bloomberg-orange px-3 py-1 text-[11px] text-bloomberg-orange hover:bg-bloomberg-orange hover:text-black disabled:opacity-50"
              >
                Run robustness check
              </button>
            </div>
            {robust.status === 'idle' && (
              <p className="text-[11px] text-bloomberg-white/80">
                Sweeps the parameter grid and runs an anchored walk-forward. If only one narrow
                parameter pocket works, the edge is probably luck.
              </p>
            )}
            {robust.status === 'running' && (
              <p role="status" className="text-[11px] text-bloomberg-amber">
                Running…
              </p>
            )}
            {robust.status === 'done' && sweep && (
              <Heatmap
                caption="Parameter sweep · Sharpe"
                rowHeader={sweep.colKey ? `${sweep.rowKey} / ${sweep.colKey}` : sweep.rowKey}
                rowLabels={sweep.rowValues.map(String)}
                colLabels={sweep.colKey ? sweep.colValues.map(String) : ['Sharpe']}
                values={sweepValues}
                formatValue={(v) => (finite(v) ? v.toFixed(2) : DASH)}
                colorFor={(v) => divergingColor(v, sweepMax)}
                textColorFor={(v) => textOnDiverging(v, sweepMax)}
                highlight={
                  currentRow >= 0 && currentCol >= 0
                    ? { row: currentRow, col: currentCol }
                    : undefined
                }
                onCellClick={(i, j) => onApplyParams(sweep.cells[i][j].params)}
              />
            )}
            {robust.status === 'done' &&
              (robust.wf ? (
                <>
                  <DataTable
                    caption="Walk-forward (anchored, 4 folds)"
                    rowKey={(r) => String(r.fold)}
                    rows={robust.wf.folds}
                    columns={[
                      { key: 'fold', label: 'Fold', align: 'right' },
                      {
                        key: 'train',
                        label: 'Trained until',
                        render: (r) => dates[r.trainEnd - 1],
                      },
                      {
                        key: 'test',
                        label: 'Test window',
                        render: (r) => `${dates[r.testStart]} → ${dates[r.testEnd - 1]}`,
                      },
                      {
                        key: 'params',
                        label: 'Chosen',
                        render: (r) => paramsLabel(strategy, r.params),
                      },
                      {
                        key: 'trainSharpe',
                        label: 'Train Sharpe',
                        align: 'right',
                        render: (r) => fmtRatio(r.trainSharpe),
                      },
                      {
                        key: 'testReturn',
                        label: 'Test return',
                        align: 'right',
                        render: (r) => fmtSignedPct(r.testReturn),
                        className: (r) => signedClass(r.testReturn),
                      },
                      {
                        key: 'testSharpe',
                        label: 'Test Sharpe',
                        align: 'right',
                        render: (r) => fmtRatio(r.testSharpe),
                      },
                    ]}
                  />
                  <p className="text-[11px] text-bloomberg-white/80">
                    Stitched out-of-sample: {fmtSignedPct(robust.wf.oosReturn)} return, Sharpe{' '}
                    {fmtRatio(robust.wf.oosSharpe)}. Compare with the in-sample Sharpe of the chosen
                    parameters — a large gap means overfitting.
                  </p>
                </>
              ) : (
                <NoticeBox title="Walk-forward">
                  Not enough history for four test windows of at least 30 periods.
                </NoticeBox>
              ))}
          </div>
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
  onApplyParams: PropTypes.func.isRequired,
  result: PropTypes.object,
  dates: PropTypes.arrayOf(PropTypes.string).isRequired,
  closes: PropTypes.arrayOf(PropTypes.number).isRequired,
  rf: PropTypes.number.isRequired,
  ppy: PropTypes.number.isRequired,
};
