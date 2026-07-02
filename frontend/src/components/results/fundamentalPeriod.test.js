import { describe, expect, it } from 'vitest';

import { displayPeriodLabel, expandYear } from './fundamentalPeriod';

describe('expandYear', () => {
  it('expands 2-digit years around the 50 pivot', () => {
    expect(expandYear(24)).toBe(2024);
    expect(expandYear(49)).toBe(2049);
    expect(expandYear(50)).toBe(1950);
    expect(expandYear(99)).toBe(1999);
  });

  it('passes through 4-digit years and rejects junk', () => {
    expect(expandYear(2023)).toBe(2023);
    expect(expandYear('2023')).toBe(2023);
    expect(expandYear('abc')).toBeNull();
  });
});

describe('displayPeriodLabel', () => {
  it('formats fiscal years', () => {
    expect(displayPeriodLabel({ display_period: 'FY24' })).toBe('FY 2024');
    expect(displayPeriodLabel({ display_period: 'fy 2023' })).toBe('FY 2023');
  });

  it('formats quarters in both FY-first and Q-first forms', () => {
    expect(displayPeriodLabel({ display_period: 'FY24Q1' })).toBe('Q1 2024');
    expect(displayPeriodLabel({ display_period: 'Q3 24' })).toBe('Q3 2024');
    expect(displayPeriodLabel({ display_period: 'q2 2023' })).toBe('Q2 2023');
  });

  it('falls back through label and period fields', () => {
    expect(displayPeriodLabel({ label: 'FY22' })).toBe('FY 2022');
    expect(displayPeriodLabel({ period: 'TTM' })).toBe('TTM');
  });

  it('returns dash for empty input', () => {
    expect(displayPeriodLabel({})).toBe('-');
    expect(displayPeriodLabel(null)).toBe('-');
  });
});
