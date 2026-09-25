import { backtest, warmupBars } from './backtestLite';
import { sharpe } from './risk';
import { TRADING_DAYS } from './stats';

export const SWEEP_GRIDS = {
  sma: {
    rows: { key: 'fast', values: [5, 10, 15, 20, 30, 40, 50] },
    cols: { key: 'slow', values: [20, 50, 100, 150, 200] },
  },
  momentum: { rows: { key: 'lookback', values: [10, 20, 40, 60, 90, 120, 160, 200] }, cols: null },
  meanrev: { rows: { key: 'lookback', values: [5, 10, 20, 30, 50, 75, 100] }, cols: null },
};

export function parameterSweep(closes, strategy, baseParams = {}, rf = 0, ppy = TRADING_DAYS) {
  const grid = SWEEP_GRIDS[strategy];
  if (!grid) return null;
  const colValues = grid.cols ? grid.cols.values : [null];
  const cells = grid.rows.values.map((rowValue) =>
    colValues.map((colValue) => {
      const params = { ...baseParams, oosFrac: 0, [grid.rows.key]: rowValue };
      if (grid.cols) params[grid.cols.key] = colValue;
      const res = backtest(closes, strategy, params, rf, ppy);
      return res
        ? { params, sharpe: res.sharpe, finalReturn: res.finalReturn, trades: res.trades }
        : null;
    })
  );
  return {
    rowKey: grid.rows.key,
    rowValues: grid.rows.values,
    colKey: grid.cols ? grid.cols.key : null,
    colValues: grid.cols ? grid.cols.values : [],
    cells,
  };
}

export function bestCell(sweep) {
  let best = null;
  for (const row of sweep?.cells || []) {
    for (const cell of row) {
      if (cell && Number.isFinite(cell.sharpe) && (!best || cell.sharpe > best.sharpe)) best = cell;
    }
  }
  return best;
}

const compound = (rets) => rets.reduce((e, r) => e * (1 + r), 1) - 1;

// Anchored walk-forward: pick the best in-sample parameters on everything before each
// test window, then trade them unseen. Test returns start at testStart (warm-up excluded).
export function walkForward(
  closes,
  strategy,
  baseParams = {},
  { folds = 4, rf = 0, ppy = TRADING_DAYS } = {}
) {
  const n = closes.length;
  const firstTest = Math.floor(n * 0.5);
  const testLen = Math.floor((n - firstTest) / folds);
  if (testLen < 30) return null;

  const rows = [];
  const oosReturns = [];
  for (let k = 0; k < folds; k += 1) {
    const testStart = firstTest + k * testLen;
    const testEnd = k === folds - 1 ? n : testStart + testLen;
    const best = bestCell(
      parameterSweep(closes.slice(0, testStart), strategy, baseParams, rf, ppy)
    );
    if (!best) continue;
    const from = Math.max(0, testStart - warmupBars(strategy, best.params) - 1);
    const test = backtest(closes.slice(from, testEnd), strategy, best.params, rf, ppy);
    if (!test) continue;
    const foldReturns = test.returns.slice(Math.max(0, testStart - from - test.startIndex));
    if (foldReturns.length === 0) continue;
    oosReturns.push(...foldReturns);
    rows.push({
      fold: k + 1,
      trainEnd: testStart,
      testStart,
      testEnd,
      params: best.params,
      trainSharpe: best.sharpe,
      testReturn: compound(foldReturns) * 100,
      testSharpe: sharpe(foldReturns, rf, ppy),
    });
  }
  if (rows.length === 0) return null;
  return {
    folds: rows,
    oosReturn: compound(oosReturns) * 100,
    oosSharpe: sharpe(oosReturns, rf, ppy),
  };
}
