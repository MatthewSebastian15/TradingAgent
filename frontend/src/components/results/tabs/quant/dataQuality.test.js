import { describe, expect, it } from 'vitest';

import { assessSeries } from './dataQuality';

function weekdays(n, start = '2026-01-05') {
  const out = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  while (out.length < n) {
    const d = new Date(t);
    const day = d.getUTCDay();
    if (day !== 0 && day !== 6) out.push(d.toISOString().slice(0, 10));
    t += 86_400_000;
  }
  return out;
}

const series = (closes, volume = 1000) =>
  weekdays(closes.length).map((date, i) => ({ date, close: closes[i], volume }));
const codes = (report) => report.issues.map((i) => i.code);
const clean = Array.from({ length: 200 }, (_, i) => 100 + i * 0.1);

describe('assessSeries', () => {
  it('clean long series -> no issues, window metadata', () => {
    const report = assessSeries(series(clean));
    expect(report.issues).toEqual([]);
    expect(report.observations).toBe(200);
    expect(report.startDate).toBe('2026-01-05');
  });

  it('flags short history', () => {
    const report = assessSeries(series(clean.slice(0, 50)));
    expect(codes(report)).toEqual(['short_history']);
    expect(report.issues[0].count).toBe(50);
  });

  it('flags a run of identical closes once', () => {
    const closes = [...clean];
    for (let i = 100; i < 106; i += 1) closes[i] = 150;
    const issue = assessSeries(series(closes)).issues.find((i) => i.code === 'stale_prices');
    expect(issue.count).toBe(1);
  });

  it('flags zero-volume days but ignores missing volume', () => {
    const pts = series(clean);
    pts[10] = { ...pts[10], volume: 0 };
    pts[11] = { ...pts[11], volume: null };
    const issue = assessSeries(pts).issues.find((i) => i.code === 'zero_volume');
    expect(issue.dates).toEqual([pts[10].date]);
  });

  it('flags a jump beyond ±40% (unadjusted split)', () => {
    const closes = clean.map((c, i) => (i >= 120 ? c * 2 : c));
    const issue = assessSeries(series(closes)).issues.find((i) => i.code === 'extreme_move');
    expect(issue.count).toBe(1);
    expect(issue.message).toContain('±40%');
  });

  it('flags calendar gaps longer than 7 days', () => {
    const pts = series(clean);
    pts.splice(50, 10);
    expect(codes(assessSeries(pts))).toContain('calendar_gap');
  });
});
