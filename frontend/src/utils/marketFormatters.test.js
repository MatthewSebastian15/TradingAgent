import { describe, expect, it } from 'vitest';

import {
  formatMarketChange,
  formatMarketPercent,
  formatMarketPrice,
  formatMarketVolume,
  marketChangeState,
} from './marketFormatters';

describe('formatMarketPrice', () => {
  it('returns N/A for non-finite input', () => {
    expect(formatMarketPrice(undefined)).toBe('N/A');
    expect(formatMarketPrice('abc')).toBe('N/A');
    expect(formatMarketPrice(Infinity)).toBe('N/A');
  });

  it('uses 4-5 decimals for FX pairs', () => {
    expect(formatMarketPrice(1.08543, 'EURUSD=X')).toBe('1.08543');
    expect(formatMarketPrice(1.08, 'EURUSD=X')).toBe('1.0800');
  });

  it('uses 2 decimals for treasury yields', () => {
    expect(formatMarketPrice(4.256, '^TNX')).toBe('4.26');
    expect(formatMarketPrice(4.2, '^FVX')).toBe('4.20');
    expect(formatMarketPrice(5.1, '^IRX')).toBe('5.10');
  });

  it('formats crypto by magnitude', () => {
    expect(formatMarketPrice(65000, 'BTC-USD')).toBe('65,000.00');
    expect(formatMarketPrice(0.0812345, 'DOGE-USD')).toBe('0.081235');
    expect(formatMarketPrice(2.5, 'XRP-USD')).toBe('2.5000');
  });

  it('formats generic prices by magnitude', () => {
    expect(formatMarketPrice(4321.5)).toBe('4,321.50');
    expect(formatMarketPrice(0.1234)).toBe('0.1234');
    expect(formatMarketPrice(12.3)).toBe('12.30');
    expect(formatMarketPrice(-4321.5)).toBe('-4,321.50');
  });
});

describe('formatMarketPercent', () => {
  it('signs positives, keeps negatives, N/A on junk', () => {
    expect(formatMarketPercent(1.234)).toBe('+1.23%');
    expect(formatMarketPercent(-0.5)).toBe('-0.50%');
    expect(formatMarketPercent(0)).toBe('0.00%');
    expect(formatMarketPercent('x')).toBe('N/A');
  });
});

describe('formatMarketChange', () => {
  it('signs positives, keeps negatives', () => {
    expect(formatMarketChange(12.345)).toBe('+12.35');
    expect(formatMarketChange(-3)).toBe('-3.00');
    expect(formatMarketChange(undefined)).toBe('N/A');
  });
});

describe('formatMarketVolume', () => {
  it('abbreviates by magnitude', () => {
    expect(formatMarketVolume(2_500_000_000)).toBe('2.5B');
    expect(formatMarketVolume(3_200_000)).toBe('3.2M');
    expect(formatMarketVolume(1_500)).toBe('1.5K');
    expect(formatMarketVolume(512.6)).toBe('513');
    expect(formatMarketVolume(undefined)).toBe('N/A');
  });
});

describe('marketChangeState', () => {
  it('classifies direction', () => {
    expect(marketChangeState(1)).toBe('positive');
    expect(marketChangeState(-1)).toBe('negative');
    expect(marketChangeState(0)).toBe('neutral');
    expect(marketChangeState(null)).toBe('neutral');
  });
});
