import { describe, expect, it } from 'vitest';

import { backtest, seriesStats, tradeStats, warmupBars } from './backtestLite';
import { sharpe } from './risk';
import { simpleReturns } from './stats';

const zigzag = Array.from({ length: 160 }, (_, i) => 100 + 10 * Math.sin(i / 3) + i * 0.05);
const rising = Array.from({ length: 120 }, (_, i) => 100 + i);
const compound = (rets) => rets.reduce((e, r) => e * (1 + r), 1);

describe('warmupBars', () => {
  it('matches the first index where each signal exists', () => {
    expect(warmupBars('sma', { fast: 10, slow: 30 })).toBe(29);
    expect(warmupBars('momentum', { lookback: 60 })).toBe(60);
    expect(warmupBars('meanrev', { lookback: 20 })).toBe(19);
  });
});

describe('backtest accounting', () => {
  it('transaction costs flow into the per-step returns, Sharpe input and equity', () => {
    const res = backtest(zigzag, 'sma', { fast: 5, slow: 15, costBps: 25 });
    expect(compound(res.returns)).toBeCloseTo(1 + res.finalReturn / 100, 10);
  });

  it('in-sample × out-of-sample compounds to the full return, costs included', () => {
    const res = backtest(zigzag, 'sma', { fast: 5, slow: 15, costBps: 25, oosFrac: 0.3 });
    expect((1 + res.inSampleReturn / 100) * (1 + res.outSampleReturn / 100)).toBeCloseTo(
      1 + res.finalReturn / 100,
      10
    );
  });

  it('flat days earn the daily risk-free rate', () => {
    const falling = Array.from({ length: 80 }, (_, i) => 200 - i);
    const rf = 0.0002;
    const res = backtest(falling, 'momentum', { lookback: 10 }, rf);
    const steps = falling.length - 1 - 10;
    expect(res.trades).toBe(0);
    expect(res.finalReturn).toBeCloseTo(((1 + rf) ** steps - 1) * 100, 10);
  });

  it('trade returns compound to the strategy return when rf = 0 (costs inside trades)', () => {
    const res = backtest(zigzag, 'sma', { fast: 5, slow: 15, costBps: 25 });
    expect(res.trades).toBeGreaterThan(1);
    expect(compound(res.tradeList.map((t) => t.ret / 100))).toBeCloseTo(
      1 + res.finalReturn / 100,
      10
    );
  });

  it('winRate is the share of trades with a positive return', () => {
    const res = backtest(zigzag, 'sma', { fast: 5, slow: 15 });
    const wins = res.tradeList.filter((t) => t.ret > 0).length;
    expect(res.winRate).toBeCloseTo((wins / res.tradeList.length) * 100, 10);
    expect(res.hitRate).not.toBeNull();
  });

  it('buy & hold starts at the warm-up bar', () => {
    const res = backtest(rising, 'sma', { fast: 10, slow: 30 });
    expect(res.startIndex).toBe(29);
    expect(res.equity).toHaveLength(rising.length - 29);
    expect(res.buyHoldReturn).toBeCloseTo((219 / 129 - 1) * 100, 10);
  });

  it('rejects fast >= slow and too little post-warm-up history', () => {
    expect(backtest(rising, 'sma', { fast: 50, slow: 50 })).toBeNull();
    expect(backtest(rising.slice(0, 60), 'sma', { fast: 10, slow: 50 })).toBeNull();
  });
});

describe('backtest ppy', () => {
  it('CAGR uses ppy', () => {
    const res = backtest(rising, 'sma', { fast: 10, slow: 30 }, 0, 365);
    const steps = rising.length - 1 - res.startIndex;
    expect(res.cagr).toBeCloseTo(((1 + res.finalReturn / 100) ** (365 / steps) - 1) * 100, 10);
  });
});

describe('seriesStats', () => {
  it('summarizes an equity curve', () => {
    const equity = [1, 1.1, 0.99, 1.2];
    const returns = simpleReturns(equity);
    const s = seriesStats(equity, returns, 0);
    expect(s.totalReturn).toBeCloseTo(20, 10);
    expect(s.maxDD).toBeCloseTo(-10, 10);
    expect(s.sharpe).toBeCloseTo(sharpe(returns, 0), 10);
    expect(seriesStats([1], [], 0)).toBeNull();
  });
});

describe('tradeStats', () => {
  it('computes win rate, payoff and turnover', () => {
    const t = tradeStats(
      [
        { ret: 10, days: 5 },
        { ret: -5, days: 3 },
        { ret: 4, days: 2 },
      ],
      2
    );
    expect(t.winRate).toBeCloseTo(66.6667, 3);
    expect(t.avgWin).toBeCloseTo(7, 10);
    expect(t.avgLoss).toBeCloseTo(-5, 10);
    expect(t.profitFactor).toBeCloseTo(2.8, 10);
    expect(t.avgHoldDays).toBeCloseTo(10 / 3, 10);
    expect(t.turnoverPerYear).toBeCloseTo(3, 10);
    expect(tradeStats([], 1).winRate).toBeNull();
  });
});

describe('prefix-sum SMA signals', () => {
  it('keeps the same trades on a long zigzag series', () => {
    const series = Array.from(
      { length: 900 },
      (_, i) => 100 + 15 * Math.sin(i / 11) + 4 * Math.sin(i / 3)
    );
    const res = backtest(series, 'sma', { fast: 10, slow: 60 });
    expect(res.trades).toBeGreaterThan(5);
    expect(compound(res.tradeList.map((t) => t.ret / 100))).toBeCloseTo(
      1 + res.finalReturn / 100,
      10
    );
  });
});
