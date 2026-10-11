import { describe, expect, it } from 'vitest';

import { currencyForSymbol, formatMoney, resolveCurrency } from './currency';

describe('currencyForSymbol', () => {
  it('maps known suffixes and defaults to USD', () => {
    expect(currencyForSymbol('BBCA.JK')).toBe('IDR');
    expect(currencyForSymbol('0700.hk')).toBe('HKD');
    expect(currencyForSymbol('7203.T')).toBe('JPY');
    expect(currencyForSymbol('SAP.DE')).toBe('EUR');
    expect(currencyForSymbol('VOD.L')).toBe('GBp');
    expect(currencyForSymbol('AAPL')).toBe('USD');
    expect(currencyForSymbol(undefined)).toBe('USD');
  });
});

describe('resolveCurrency', () => {
  it('prefers the currency reported by the quote, case preserved', () => {
    expect(resolveCurrency({ currency: 'GBp' }, 'VOD.L')).toBe('GBp');
    expect(resolveCurrency({ currency: ' CAD ' }, 'SHOP.TO')).toBe('CAD');
  });

  it('falls back to the suffix map when the quote has none', () => {
    expect(resolveCurrency({ price: 1 }, 'BBCA.JK')).toBe('IDR');
    expect(resolveCurrency(undefined, 'AAPL')).toBe('USD');
    expect(resolveCurrency({ currency: '' }, 'BBCA.JK')).toBe('IDR');
  });
});

describe('formatMoney', () => {
  it('formats USD with two decimals and a $ prefix', () => {
    expect(formatMoney(1234.5, 'USD')).toBe('$1,234.50');
    expect(formatMoney(-12.5, 'USD')).toBe('-$12.50');
  });

  it('uses zero decimals and the Rp prefix for IDR and the yen sign for JPY', () => {
    expect(formatMoney(950000, 'IDR')).toBe('Rp 950,000');
    expect(formatMoney(1234.6, 'JPY')).toBe('¥1,235');
  });

  it('prefixes unknown codes with the code itself (GBp is pence, not pounds)', () => {
    expect(formatMoney(123.456, 'GBp')).toBe('GBp 123.46');
    expect(formatMoney(5, 'CAD')).toBe('CAD 5.00');
  });

  it('supports an explicit plus sign for gains', () => {
    expect(formatMoney(200, 'USD', { signed: true })).toBe('+$200.00');
    expect(formatMoney(-200, 'USD', { signed: true })).toBe('-$200.00');
    expect(formatMoney(50000, 'IDR', { signed: true })).toBe('+Rp 50,000');
  });

  it('never prints a negative zero', () => {
    expect(formatMoney(-0.001, 'USD')).toBe('$0.00');
    expect(formatMoney(0, 'USD', { signed: true })).toBe('$0.00');
  });

  it('returns a dash for missing or non-finite input', () => {
    for (const value of [null, undefined, '', NaN, Infinity, 'abc']) {
      expect(formatMoney(value, 'USD')).toBe('-');
    }
  });
});
