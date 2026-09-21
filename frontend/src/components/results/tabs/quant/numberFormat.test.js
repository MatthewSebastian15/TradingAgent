import { describe, expect, it } from 'vitest';

import { currencyDecimals, fmtInt, fmtMoney, fmtMoneyCompact } from './numberFormat';

describe('numberFormat', () => {
  it('uses 0 decimals for IDR/JPY and 2 otherwise', () => {
    expect(currencyDecimals('IDR')).toBe(0);
    expect(currencyDecimals('jpy')).toBe(0);
    expect(currencyDecimals('USD')).toBe(2);
    expect(currencyDecimals('')).toBe(2);
  });

  it.each(['KRW', 'VND', 'CLP', 'HUF'])('uses 0 decimals for %s', (ccy) => {
    expect(currencyDecimals(ccy)).toBe(0);
    expect(fmtMoney(1234.56, ccy)).toBe(`${ccy} 1,235`);
  });

  it('fmtMoney adds separators and an upper-cased code prefix', () => {
    expect(fmtMoney(9125.4, 'IDR')).toBe('IDR 9,125');
    expect(fmtMoney(182.4, 'usd')).toBe('USD 182.40');
    expect(fmtMoney(-1234.5, '')).toBe('-1,234.50');
    expect(fmtMoney(Number.NaN, 'USD')).toBe('—');
  });

  it('fmtMoneyCompact uses K/M/B/T', () => {
    expect(fmtMoneyCompact(12_340_000_000_000, 'IDR')).toBe('IDR 12.34T');
    expect(fmtMoneyCompact(1_500_000_000, 'USD')).toBe('USD 1.5B');
    expect(fmtMoneyCompact(950, 'USD')).toBe('USD 950');
    expect(fmtMoneyCompact(-1_500_000_000, 'USD')).toBe('USD -1.5B');
  });

  it('fmtInt rounds and groups', () => {
    expect(fmtInt(1234.6)).toBe('1,235');
    expect(fmtInt(null)).toBe('—');
  });
});
