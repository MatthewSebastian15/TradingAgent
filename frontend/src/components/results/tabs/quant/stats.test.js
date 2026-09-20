import { describe, expect, it } from 'vitest';

import { ewmaSigmaDaily, ewmaVol, periodsPerYearFromDates, rollingVol } from './stats';

describe('ewmaSigmaDaily seeding', () => {
  it('an extreme first return does not dominate 100 later calm days', () => {
    const calm = Array.from({ length: 100 }, (_, i) => (i % 2 ? 0.01 : -0.01));
    const sigma = ewmaSigmaDaily([0.5, ...calm]);
    expect(sigma).toBeLessThan(0.02);
  });

  it('series shorter than the seed window uses their mean square', () => {
    expect(ewmaSigmaDaily([0.02, -0.02, 0.02])).toBeCloseTo(0.02, 12);
  });
});

describe('periodsPerYearFromDates', () => {
  const calendarDays = Array.from({ length: 30 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
  );
  const weekdaysOnly = calendarDays.filter(
    (d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay())
  );

  it('7-day markets -> 365, weekday markets -> 252, short input -> 252', () => {
    expect(periodsPerYearFromDates(calendarDays)).toBe(365);
    expect(periodsPerYearFromDates(weekdaysOnly)).toBe(252);
    expect(periodsPerYearFromDates(calendarDays.slice(0, 5))).toBe(252);
  });
});

describe('ppy scaling in stats', () => {
  const closes = [100, 102, 99, 104, 101, 107, 103, 108];
  it('rollingVol and ewmaVol scale with sqrt(ppy)', () => {
    const ratio = Math.sqrt(365 / 252);
    expect(rollingVol(closes, 3, 365)[0] / rollingVol(closes, 3)[0]).toBeCloseTo(ratio, 10);
    expect(ewmaVol(closes, 0.94, 365) / ewmaVol(closes)).toBeCloseTo(ratio, 10);
  });
});
