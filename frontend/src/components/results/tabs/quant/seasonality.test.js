import { describe, expect, it } from 'vitest';

import { returnsByMonth, returnsByWeekday } from './seasonality';

describe('returnsByWeekday', () => {
  it('groups each return by the weekday it ends on', () => {
    const points = [
      { date: '2026-01-05', close: 100 },
      { date: '2026-01-06', close: 101 },
      { date: '2026-01-07', close: 100 },
      { date: '2026-01-08', close: 102 },
      { date: '2026-01-09', close: 102 },
      { date: '2026-01-12', close: 103 },
    ];
    const rows = returnsByWeekday(points);
    const mon = rows.find((r) => r.label === 'Mon');
    const fri = rows.find((r) => r.label === 'Fri');
    expect(mon.count).toBe(1);
    expect(mon.meanPct).toBeCloseTo((103 / 102 - 1) * 100, 10);
    expect(fri.hitRate).toBe(0);
  });

  it('returns [] for empty points', () => {
    expect(returnsByWeekday([])).toEqual([]);
  });

  it('returns [] when there is under 2 days of data (no prior close to diff against)', () => {
    expect(returnsByWeekday([{ date: '2026-01-05', close: 100 }])).toEqual([]);
  });
});

describe('returnsByMonth', () => {
  it('uses month-end closes', () => {
    const points = [
      { date: '2026-01-02', close: 95 },
      { date: '2026-01-30', close: 100 },
      { date: '2026-02-27', close: 110 },
      { date: '2026-03-31', close: 99 },
    ];
    const rows = returnsByMonth(points);
    expect(rows.map((r) => r.label)).toEqual(['Feb', 'Mar']);
    expect(rows[0].meanPct).toBeCloseTo(10, 10);
    expect(rows[1].meanPct).toBeCloseTo(-10, 10);
  });

  it('returns [] for empty points', () => {
    expect(returnsByMonth([])).toEqual([]);
  });

  it('excludes a lone starting month with no prior month to diff against', () => {
    expect(returnsByMonth([{ date: '2026-01-05', close: 100 }])).toEqual([]);
  });

  it('returns [] when all points fall within a single month', () => {
    const points = [
      { date: '2026-01-02', close: 95 },
      { date: '2026-01-15', close: 97 },
      { date: '2026-01-30', close: 100 },
    ];
    expect(returnsByMonth(points)).toEqual([]);
  });
});
