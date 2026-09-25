import { describe, expect, it } from 'vitest';

import {
  blackScholes,
  breakeven,
  dividendYieldFromOverview,
  expectedMove,
  impliedVol,
  optionCurves,
  solveImpliedVol,
  trailingVol,
} from './options';
import { annualizedVol } from './stats';

describe('Merton dividend yield', () => {
  it('keeps put-call parity with q', () => {
    const [S, K, T, r, q] = [100, 95, 0.5, 0.04, 0.03];
    const c = blackScholes(S, K, T, r, 0.25, 'call', q).price;
    const p = blackScholes(S, K, T, r, 0.25, 'put', q).price;
    expect(c - p).toBeCloseTo(S * Math.exp(-q * T) - K * Math.exp(-r * T), 8);
  });

  it('dividends lower calls and raise puts', () => {
    expect(blackScholes(100, 100, 1, 0.04, 0.2, 'call', 0.03).price).toBeLessThan(
      blackScholes(100, 100, 1, 0.04, 0.2, 'call').price
    );
    expect(blackScholes(100, 100, 1, 0.04, 0.2, 'put', 0.03).price).toBeGreaterThan(
      blackScholes(100, 100, 1, 0.04, 0.2, 'put').price
    );
  });

  it('probItm of call and put sum to 1', () => {
    const c = blackScholes(100, 105, 0.3, 0.03, 0.3, 'call', 0.01);
    const p = blackScholes(100, 105, 0.3, 0.03, 0.3, 'put', 0.01);
    expect(c.probItm + p.probItm).toBeCloseTo(1, 7);
  });
});

describe('solveImpliedVol', () => {
  it('round-trips with dividends', () => {
    const price = blackScholes(100, 110, 0.75, 0.04, 0.37, 'call', 0.02).price;
    expect(solveImpliedVol(price, 100, 110, 0.75, 0.04, 'call', 0.02).iv).toBeCloseTo(0.37, 6);
    expect(impliedVol(price, 100, 110, 0.75, 0.04, 'call')).not.toBeNull();
  });

  it('explains prices outside arbitrage bounds', () => {
    expect(solveImpliedVol(0.1, 100, 100, 30 / 365, 0.04, 'call', 0.02).reason).toBe(
      'below_intrinsic'
    );
    expect(solveImpliedVol(150, 100, 100, 0.5, 0.04, 'call').reason).toBe('above_max');
    expect(solveImpliedVol(-1, 100, 100, 0.5, 0.04, 'call').reason).toBe('invalid_input');
  });
});

describe('option helpers', () => {
  const closes = Array.from({ length: 120 }, (_, i) => 100 + 5 * Math.sin(i / 4) + i * 0.1);

  it('trailingVol matches the realized vol over a horizon-matched window', () => {
    expect(trailingVol(closes, 30, 252)).toBeCloseTo(annualizedVol(closes.slice(-22), 252), 10);
  });

  it('dividend yield comes from dividend rate / spot', () => {
    expect(dividendYieldFromOverview({ div_rate: 2 }, 100)).toBeCloseTo(0.02, 12);
    expect(dividendYieldFromOverview({ dividend_yield: 0.44 }, 100)).toBe(0);
  });

  it('breakeven and expected move', () => {
    expect(breakeven('call', 100, 4)).toBe(104);
    expect(breakeven('put', 100, 4)).toBe(96);
    expect(expectedMove(100, 0.2, 0.25)).toBeCloseTo(10, 10);
  });

  it('payoff curve nets the premium and today value carries time value', () => {
    const premium = blackScholes(100, 100, 0.5, 0.04, 0.25, 'call').price;
    const curves = optionCurves({
      type: 'call',
      strike: 100,
      T: 0.5,
      r: 0.04,
      sigma: 0.25,
      q: 0,
      premium,
      spot: 100,
    });
    expect(curves.payoff).toHaveLength(81);
    const atStrike = curves.payoff.findIndex((p) => p.x >= 100);
    expect(curves.today[atStrike].y).toBeGreaterThan(curves.payoff[atStrike].y);
    const last = curves.payoff.at(-1);
    expect(last.y).toBeCloseTo(last.x - 100 - premium, 8);
  });
});
