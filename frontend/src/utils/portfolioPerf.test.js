import { describe, expect, it } from 'vitest';

import {
  decisionDirection,
  horizonInfo,
  isNeutral,
  POSITION_STATUS,
  positionReturn,
  positionStatus,
  returnPct,
  summarize,
  usableLevels,
} from './portfolioPerf';

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

describe('returnPct null prices', () => {
  it('returns null when the current price is null instead of -100% / +100%', () => {
    expect(returnPct('BUY', 100, null)).toBeNull();
    expect(returnPct('SELL', 100, null)).toBeNull();
  });
});

describe('usableLevels', () => {
  it('keeps levels on the correct side of the entry for a long', () => {
    expect(usableLevels('BUY', 100, 90, 120)).toEqual({ stop: 90, target: 120 });
  });

  it('drops a stop above a long entry and a target below it', () => {
    expect(usableLevels('BUY', 100, 105, 95)).toEqual({ stop: null, target: null });
  });

  it('mirrors the rule for a short', () => {
    expect(usableLevels('SELL', 100, 110, 80)).toEqual({ stop: 110, target: 80 });
    expect(usableLevels('SELL', 100, 90, 120)).toEqual({ stop: null, target: null });
  });

  it('has no levels for neutral decisions or a missing entry', () => {
    expect(usableLevels('HOLD', 100, 90, 120)).toEqual({ stop: null, target: null });
    expect(usableLevels('BUY', null, 90, 120)).toEqual({ stop: null, target: null });
  });
});

describe('positionStatus', () => {
  const fresh = new Date().toISOString();
  const long = {
    decision: 'BUY',
    entry_price: 100,
    stop_loss: 90,
    take_profit: 120,
    entry_at: fresh,
    time_horizon_months: 3,
  };
  const short = {
    decision: 'SELL',
    entry_price: 100,
    stop_loss: 110,
    take_profit: 80,
    entry_at: fresh,
    time_horizon_months: 3,
  };
  const old = new Date(Date.now() - 200 * 86_400_000).toISOString();

  it('reports target, stop and open for a long', () => {
    expect(positionStatus(long, 125)).toBe(POSITION_STATUS.TARGET);
    expect(positionStatus(long, 120)).toBe(POSITION_STATUS.TARGET);
    expect(positionStatus(long, 85)).toBe(POSITION_STATUS.STOP);
    expect(positionStatus(long, 105)).toBe(POSITION_STATUS.OPEN);
  });

  it('reports target, stop and open for a short', () => {
    expect(positionStatus(short, 79)).toBe(POSITION_STATUS.TARGET);
    expect(positionStatus(short, 111)).toBe(POSITION_STATUS.STOP);
    expect(positionStatus(short, 95)).toBe(POSITION_STATUS.OPEN);
  });

  it('falls back to matured, and price events outrank maturity', () => {
    expect(positionStatus({ ...long, entry_at: old }, 105)).toBe(POSITION_STATUS.MATURED);
    expect(positionStatus({ ...long, entry_at: old }, 130)).toBe(POSITION_STATUS.TARGET);
  });

  it('ignores levels when there is no live price', () => {
    expect(positionStatus(long, null)).toBe(POSITION_STATUS.OPEN);
    expect(positionStatus({ ...long, entry_at: old }, null)).toBe(POSITION_STATUS.MATURED);
  });

  it('is closed once closed_at is set, whatever the price does', () => {
    expect(
      positionStatus({ ...long, closed_at: '2026-01-01T00:00:00Z', exit_price: 110 }, 200)
    ).toBe(POSITION_STATUS.CLOSED);
  });
});

describe('positionReturn', () => {
  it('uses the current price for open positions and the exit price for closed ones', () => {
    const open = { decision: 'BUY', entry_price: 100 };
    const closed = {
      decision: 'BUY',
      entry_price: 100,
      closed_at: '2026-01-01T00:00:00Z',
      exit_price: 120,
    };

    expect(positionReturn(open, 90)).toBeCloseTo(-0.1);
    expect(positionReturn(closed, 90)).toBeCloseTo(0.2); // frozen at exit
    expect(positionReturn(closed, null)).toBeCloseTo(0.2); // no live price needed
  });
});

describe('summarize with lifecycle', () => {
  const fresh = new Date().toISOString();
  const positions = [
    {
      ticker: 'AAA',
      decision: 'BUY',
      entry_price: 100,
      closed_at: '2026-01-01T00:00:00Z',
      exit_price: 120,
    },
    {
      ticker: 'BBB',
      decision: 'BUY',
      entry_price: 100,
      stop_loss: 90,
      take_profit: 130,
      entry_at: fresh,
      time_horizon_months: 3,
    },
    {
      ticker: 'CCC',
      decision: 'SELL',
      entry_price: 100,
      stop_loss: 110,
      take_profit: 80,
      entry_at: fresh,
      time_horizon_months: 3,
    },
  ];
  const prices = { AAA: 50, BBB: 85, CCC: 70 };
  const s = summarize(positions, (ticker) => prices[ticker]);

  it("counts closed positions at their exit price, not today's price", () => {
    expect(s.valuedCount).toBe(3);
    expect(s.closedCount).toBe(1);
    expect(s.openCount).toBe(2);
    expect(s.best.ticker).toBe('CCC'); // short from 100 to 70 = +30 %
    expect(s.winRate).toBeCloseTo(2 / 3); // AAA +20 %, CCC +30 %, BBB -15 %
    expect(s.sampleSize).toBe(3);
  });

  it('counts target and stop hits among open positions', () => {
    expect(s.stopHits).toBe(1); // BBB at 85 <= 90
    expect(s.targetHits).toBe(1); // CCC at 70 <= 80
  });

  it('keeps the previous result fields', () => {
    expect(s.trackedCount).toBe(3);
    expect(s).toHaveProperty('avgReturn');
    expect(s).toHaveProperty('worst');
  });
});
