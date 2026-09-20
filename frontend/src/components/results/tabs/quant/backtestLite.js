import { sharpe } from './risk';
import { maxDrawdown, TRADING_DAYS } from './stats';

// --- lite backtester --------------------------------------------------------

function smaAt(arr, w, i) {
  if (i + 1 < w) return null;
  let s = 0;
  for (let k = i - w + 1; k <= i; k += 1) s += arr[k];
  return s / w;
}

// First bar where the strategy's signal is defined. Evaluation (and buy & hold)
// starts here so both legs cover the same window.
export function warmupBars(strategy, params = {}) {
  if (strategy === 'sma') return (params.slow || 50) - 1;
  if (strategy === 'momentum') return params.lookback || 60;
  if (strategy === 'meanrev') return (params.lookback || 20) - 1;
  return 0;
}

function signalsFor(closes, strategy, params) {
  const n = closes.length;
  const signal = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    if (strategy === 'sma') {
      const f = smaAt(closes, params.fast || 20, i);
      const s = smaAt(closes, params.slow || 50, i);
      signal[i] = f != null && s != null && f > s ? 1 : 0;
    } else if (strategy === 'momentum') {
      const lb = params.lookback || 60;
      signal[i] = i >= lb && closes[i] > closes[i - lb] ? 1 : 0;
    } else if (strategy === 'meanrev') {
      const m = smaAt(closes, params.lookback || 20, i);
      signal[i] = m != null && closes[i] < m ? 1 : 0;
    }
  }
  return signal;
}

// Long/flat strategies. The position decided at close i earns day i+1's return
// (no look-ahead). A one-way cost of costBps is charged on every position change,
// inside the per-step return, so equity, Sharpe, the in/out-of-sample split and
// per-trade returns all agree. Flat days earn the daily risk-free rate `rf`.
// ponytail: three hard-coded strategies, long/flat only. Not a general engine. (deliberate)
export function backtest(closes, strategy, params = {}, rf = 0) {
  const n = closes.length;
  if (strategy === 'sma' && (params.fast || 20) >= (params.slow || 50)) return null;
  const start = warmupBars(strategy, params);
  if (n - start < 30) return null;

  const cost = (params.costBps || 0) / 10000;
  const signal = signalsFor(closes, strategy, params);
  const oosStart = params.oosFrac > 0 ? start + Math.floor((n - start) * (1 - params.oosFrac)) : n;

  let eq = 1;
  let bh = 1;
  let isEq = 1;
  let oosEq = 1;
  let prevPos = 0;
  let inDays = 0;
  let upDays = 0;
  let open = null;
  const equity = [1];
  const buyhold = [1];
  const returns = [];
  const tradeList = [];

  for (let i = start + 1; i < n; i += 1) {
    const r = closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    bh *= 1 + r;
    const pos = signal[i - 1];
    const flip = pos !== prevPos;
    const gross = pos ? r : rf;
    const net = (1 - (flip ? cost : 0)) * (1 + gross) - 1;
    const eqBefore = eq;
    eq *= 1 + net;

    if (flip && pos === 1) open = { entryIndex: i - 1, entryEquity: eqBefore };
    if (flip && pos === 0 && open) {
      tradeList.push({
        entryIndex: open.entryIndex,
        exitIndex: i - 1,
        days: i - 1 - open.entryIndex,
        ret: ((eqBefore * (1 - cost)) / open.entryEquity - 1) * 100,
        open: false,
      });
      open = null;
    }

    if (i >= oosStart) oosEq *= 1 + net;
    else isEq *= 1 + net;
    equity.push(eq);
    buyhold.push(bh);
    returns.push(net);
    prevPos = pos;
    if (pos) {
      inDays += 1;
      if (r > 0) upDays += 1;
    }
  }

  if (open) {
    tradeList.push({
      entryIndex: open.entryIndex,
      exitIndex: n - 1,
      days: n - 1 - open.entryIndex,
      ret: (eq / open.entryEquity - 1) * 100,
      open: true,
    });
  }

  const steps = n - 1 - start;
  const years = steps / TRADING_DAYS;
  const wins = tradeList.filter((t) => t.ret > 0).length;
  return {
    startIndex: start,
    equity,
    buyhold,
    returns,
    cagr: years > 0 ? (eq ** (1 / years) - 1) * 100 : null,
    sharpe: sharpe(returns, rf),
    maxDD: maxDrawdown(equity),
    winRate: tradeList.length ? (wins / tradeList.length) * 100 : null,
    hitRate: inDays ? (upDays / inDays) * 100 : null,
    finalReturn: (eq - 1) * 100,
    buyHoldReturn: (bh - 1) * 100,
    exposure: steps ? (inDays / steps) * 100 : null,
    trades: tradeList.length,
    tradeList,
    inSampleReturn: params.oosFrac > 0 ? (isEq - 1) * 100 : null,
    outSampleReturn: params.oosFrac > 0 ? (oosEq - 1) * 100 : null,
  };
}
