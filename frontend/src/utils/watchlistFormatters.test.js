import { describe, expect, it } from 'vitest';

import {
  formatChangePercent,
  formatLastPrice,
  formatVolume,
  normalizeWatchlistSymbol,
} from './watchlistFormatters';

describe('normalizeWatchlistSymbol', () => {
  it('trims and uppercases, empty on junk', () => {
    expect(normalizeWatchlistSymbol(' bbca.jk ')).toBe('BBCA.JK');
    expect(normalizeWatchlistSymbol(null)).toBe('');
  });
});

describe('formatLastPrice', () => {
  it('formats with two decimals and thousands separators', () => {
    expect(formatLastPrice(1234.5)).toBe('1,234.50');
    expect(formatLastPrice(0)).toBe('0.00');
  });

  it('returns dash for missing quote', () => {
    expect(formatLastPrice(undefined)).toBe('-');
    expect(formatLastPrice('abc')).toBe('-');
  });
});

describe('formatChangePercent', () => {
  it('signs numeric values', () => {
    expect(formatChangePercent(1.5)).toBe('+1.50%');
    expect(formatChangePercent(-2)).toBe('-2.00%');
    expect(formatChangePercent(0)).toBe('0.00%');
  });

  it('passes through preformatted strings, dashes N/A', () => {
    expect(formatChangePercent('+3.4%')).toBe('+3.4%');
    expect(formatChangePercent(' N/A')).toBe('-');
    expect(formatChangePercent('')).toBe('-');
  });

  it('returns dash for null/undefined', () => {
    expect(formatChangePercent(null)).toBe('-');
    expect(formatChangePercent(undefined)).toBe('-');
  });
});

describe('formatVolume', () => {
  it('abbreviates by magnitude', () => {
    expect(formatVolume(2_000_000_000)).toBe('2.0B');
    expect(formatVolume(1_500_000)).toBe('1.5M');
    expect(formatVolume(12_300)).toBe('12.3K');
    expect(formatVolume(999)).toBe('999');
  });

  it('returns dash for negative or invalid values', () => {
    expect(formatVolume(-5)).toBe('-');
    expect(formatVolume(undefined)).toBe('-');
  });
});
