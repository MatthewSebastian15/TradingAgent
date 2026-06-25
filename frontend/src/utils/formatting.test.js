import { describe, expect, it } from 'vitest';

import { money, pct, signClass } from './formatting';

describe('money', () => {
  it('returns - for invalid', () => {
    expect(money(null)).toBe('-');
    expect(money(NaN)).toBe('-');
  });
  it('plain vs currency variant', () => {
    expect(money(1234.5)).toBe('1,234.50');
    expect(money(1234.5, { currency: true })).toBe('$1,234.50');
  });
});

describe('pct', () => {
  it('default invalid token, no parens, signed', () => {
    expect(pct(null)).toBe('-');
    expect(pct(0.1234)).toBe('+12.34%');
    expect(pct(-0.05)).toBe('-5.00%');
  });
  it('parens + custom invalid token', () => {
    expect(pct(0.1, { parens: true })).toBe(' (+10.00%)');
    expect(pct(null, { invalid: '' })).toBe('');
  });
});

describe('signClass', () => {
  it('green/red by sign, configurable neutral', () => {
    expect(signClass(1)).toBe('text-bloomberg-green');
    expect(signClass(-1)).toBe('text-bloomberg-red');
    expect(signClass(null)).toBe('text-bloomberg-white');
    expect(signClass(null, { neutral: 'text-bloomberg-muted' })).toBe('text-bloomberg-muted');
  });
});
