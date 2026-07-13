import { sharpe } from './risk';
import { maxDrawdown, TRADING_DAYS } from './stats';

// --- lite backtester (Phase 4) --------------------------------------------

function smaAt(arr, w, i) {
  if (i + 1 < w) return null;
  let s = 0;
  for (let k = i - w + 1; k <= i; k += 1) s += arr[k];
  return s / w;
}

// Canned long/flat strategies on the price series. Position is decided on day i
// and earns day i+1's return (no look-ahead). params.costBps charges a one-way
// transaction cost (bps of notional) each time the position flips — set 0 for the
// frictionless case. params.oosFrac (0..1) marks the trailing fraction as
// out-of-sample so the UI can flag in-sample overfit.
// rf is the per-period (daily) risk-free rate, passed through to the strategy
// Sharpe so it matches the Risk tab's rf-adjusted figure (was hard-coded 0).
// ponytail: three hard-coded strategies, long/flat only. Not a general engine. (deliberate)
export function backtest(closes, strategy, params = {}, rf = 0) {
  const n = closes.length;
  if (n < 30) return null;
  const cost = (params.costBps || 0) / 10000;
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
      const w = params.lookback || 20;
      const m = smaAt(closes, w, i);
      signal[i] = m != null && closes[i] < m ? 1 : 0;
    }
  }
  let eq = 1;
  let bh = 1;
  const equity = [1];
  const buyhold = [1];
  const stratRets = [];
  let wins = 0;
  let inDays = 0;
  let trades = 0;
  let prevPos = 0;
  // Split index: returns at i >= oosStart count as out-of-sample.
  const oosStart = params.oosFrac > 0 ? Math.floor(n * (1 - params.oosFrac)) : n;
  let isEq = 1;
  let oosEq = 1;
  for (let i = 1; i < n; i += 1) {
    const r = closes[i - 1] ? (closes[i] - closes[i - 1]) / closes[i - 1] : 0;
    bh *= 1 + r;
    const pos = signal[i - 1];
    if (pos !== prevPos) {
      eq *= 1 - cost; // pay the spread/commission when entering or exiting
      trades += 1;
    }
    prevPos = pos;
    const sr = pos * r;
    eq *= 1 + sr;
    if (i >= oosStart) oosEq *= 1 + sr;
    else isEq *= 1 + sr;
    equity.push(eq);
    buyhold.push(bh);
    stratRets.push(sr);
    if (pos) {
      inDays += 1;
      if (r > 0) wins += 1;
    }
  }
  const years = (n - 1) / TRADING_DAYS;
  return {
    equity,
    buyhold,
    cagr: years > 0 ? (eq ** (1 / years) - 1) * 100 : null,
    sharpe: sharpe(stratRets, rf),
    maxDD: maxDrawdown(equity),
    winRate: inDays ? (wins / inDays) * 100 : null,
    finalReturn: (eq - 1) * 100,
    buyHoldReturn: (bh - 1) * 100,
    exposure: (inDays / (n - 1)) * 100,
    trades,
    inSampleReturn: params.oosFrac > 0 ? (isEq - 1) * 100 : null,
    outSampleReturn: params.oosFrac > 0 ? (oosEq - 1) * 100 : null,
  };
}
