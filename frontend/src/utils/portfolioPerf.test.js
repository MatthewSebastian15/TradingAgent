import { describe, expect, it } from 'vitest';

import { decisionDirection, horizonInfo, isNeutral, returnPct, summarize } from './portfolioPerf';

describe('decisionDirection', () => {
  it('maps long, short, and neutral decisions', () => {
    expect(decisionDirection('BUY')).toBe(1);
    expect(decisionDirection('overweight')).toBe(1);
    expect(decisionDirection('SELL')).toBe(-1);
    expect(decisionDirection('REDUCE')).toBe(-1);
    expect(decisionDirection('HOLD')).toBe(0);
    expect(isNeutral('WAIT')).toBe(true);
  });
});

describe('returnPct', () => {
  it('is positive for a BUY that rose', () => {
    expect(returnPct('BUY', 100, 110)).toBeCloseTo(0.1);
  });

  it('inverts direction for a SELL that fell', () => {
    expect(returnPct('SELL', 100, 90)).toBeCloseTo(0.1);
    expect(returnPct('SELL', 100, 110)).toBeCloseTo(-0.1);
  });

  it('returns raw price change for neutral decisions', () => {
    expect(returnPct('HOLD', 100, 110)).toBeCloseTo(0.1);
  });

  it('returns null for unusable prices', () => {
    expect(returnPct('BUY', 0, 100)).toBeNull();
    expect(returnPct('BUY', 100, NaN)).toBeNull();
  });
});

describe('summarize', () => {
  const positions = [
    { ticker: 'AAA', decision: 'BUY', entry_price: 100 }, // +10% win
    { ticker: 'BBB', decision: 'SELL', entry_price: 100 }, // price up -> -5% loss
    { ticker: 'CCC', decision: 'HOLD', entry_price: 100 }, // neutral, excluded from win rate
    { ticker: 'DDD', decision: 'BUY', entry_price: 0 }, // unusable, skipped
  ];
  const prices = { AAA: 110, BBB: 105, CCC: 120, DDD: 50 };
  const priceFor = (ticker) => prices[ticker];

  it('counts wins only among directional positions', () => {
    const s = summarize(positions, priceFor);
    expect(s.trackedCount).toBe(4);
    expect(s.valuedCount).toBe(3); // DDD skipped
    expect(s.winRate).toBeCloseTo(0.5); // AAA win, BBB loss; CCC neutral excluded
  });

  it('reports best and worst', () => {
    const s = summarize(positions, priceFor);
    expect(s.best.ticker).toBe('CCC'); // +20% raw
    expect(s.worst.ticker).toBe('BBB'); // -5%
  });
});

describe('horizonInfo', () => {
  it('flags a position past its horizon as matured', () => {
    const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
    expect(horizonInfo(old, 3).matured).toBe(true);
  });

  it('is not matured within the horizon', () => {
    const recent = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const info = horizonInfo(recent, 3);
    expect(info.matured).toBe(false);
    expect(info.label).toBe('5d / 3M');
  });
});
