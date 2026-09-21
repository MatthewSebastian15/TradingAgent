import { describe, expect, it } from 'vitest';

import { assessSeries, pointPrice, priceRows } from './dataQuality';

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

describe('assessSeries hardening', () => {
  it('treats non-array input as empty without throwing', () => {
    for (const bad of [{}, 'abc', 42, true]) {
      const report = assessSeries(bad);
      expect(report.observations).toBe(0);
      expect(codes(report)).toEqual(['short_history']);
    }
    expect(assessSeries(null).observations).toBe(0);
  });

  it('handles empty input', () => {
    const report = assessSeries([]);
    expect(report).toMatchObject({ observations: 0, startDate: null, endDate: null });
    expect(codes(report)).toEqual(['short_history']);
  });

  it('counts a second stale run separately', () => {
    const closes = [...clean];
    for (let i = 20; i < 26; i += 1) closes[i] = 120;
    for (let i = 100; i < 106; i += 1) closes[i] = 150;
    const issue = assessSeries(series(closes)).issues.find((i) => i.code === 'stale_prices');
    expect(issue.count).toBe(2);
  });

  it('honours option overrides', () => {
    const closes = clean.map((c, i) => (i >= 120 ? c * 1.5 : c));
    const pts = series(closes);
    expect(codes(assessSeries(pts))).toEqual(['extreme_move']);
    expect(codes(assessSeries(pts, { extremeMove: 0.6 }))).toEqual([]);
    expect(codes(assessSeries(pts, { minObservations: 500, extremeMove: 0.6 }))).toEqual([
      'short_history',
    ]);
    const gapped = series(clean);
    gapped.splice(50, 3);
    expect(codes(assessSeries(gapped))).toEqual([]);
    expect(codes(assessSeries(gapped, { gapDays: 3 }))).toContain('calendar_gap');
    const flat = [...clean];
    for (let i = 100; i < 103; i += 1) flat[i] = 150;
    expect(codes(assessSeries(series(flat), { staleRun: 3 }))).toContain('stale_prices');
  });

  it('shows the extreme-move threshold without float noise', () => {
    const closes = clean.map((c, i) => (i >= 120 ? c * 2 : c));
    const issue = assessSeries(series(closes), { extremeMove: 0.4 }).issues.find(
      (i) => i.code === 'extreme_move'
    );
    expect(issue.message).toContain('±40%');
    const odd = assessSeries(series(closes), { extremeMove: 0.29 }).issues.find(
      (i) => i.code === 'extreme_move'
    );
    expect(odd.message).toContain('±29%');
    expect(odd.message).not.toMatch(/\d{4,}/);
  });

  it('falls back to close when adjusted_close is NaN or missing', () => {
    const pts = series(clean).map((p, i) =>
      i % 2 ? { ...p, adjusted_close: NaN } : { ...p, adjusted_close: null }
    );
    const report = assessSeries(pts);
    expect(report.observations).toBe(200);
    expect(report.issues).toEqual([]);
  });
});

describe('pointPrice / priceRows', () => {
  it('prefers a finite adjusted_close, then a finite close, else null', () => {
    expect(pointPrice({ adjusted_close: 9, close: 10 })).toBe(9);
    expect(pointPrice({ adjusted_close: NaN, close: 10 })).toBe(10);
    expect(pointPrice({ adjusted_close: null, close: 10 })).toBe(10);
    expect(pointPrice({ adjusted_close: NaN, close: null })).toBeNull();
    expect(pointPrice(null)).toBeNull();
  });

  it('keeps only dated rows with a usable price, matching assessSeries', () => {
    const pts = [
      { date: '2026-01-05', adjusted_close: NaN, close: 10 },
      { date: '2026-01-06', adjusted_close: NaN, close: null },
      { close: 11 },
      { date: '2026-01-07', close: 12 },
    ];
    const rows = priceRows(pts);
    expect(rows.map((r) => r.date)).toEqual(['2026-01-05', '2026-01-07']);
    expect(rows.map(pointPrice)).toEqual([10, 12]);
    expect(assessSeries(pts, { minObservations: 0 }).observations).toBe(rows.length);
  });

  it('drops zero and negative prices, falling back to close, and flags them', () => {
    expect(pointPrice({ adjusted_close: 0, close: 10 })).toBe(10);
    expect(pointPrice({ adjusted_close: -1, close: 0 })).toBeNull();
    expect(pointPrice({ close: -3 })).toBeNull();
    const pts = series(clean);
    pts[199] = { ...pts[199], close: 0 };
    pts[198] = { ...pts[198], close: -2 };
    const report = assessSeries(pts);
    expect(report.observations).toBe(198);
    expect(report.endDate).toBe(pts[197].date);
    const issue = report.issues.find((i) => i.code === 'non_positive_price');
    expect(issue.count).toBe(2);
    expect(issue.dates).toEqual([pts[198].date, pts[199].date]);
  });
});
