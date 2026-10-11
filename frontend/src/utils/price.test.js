import { describe, expect, it } from 'vitest';

import { toPrice } from './price';

describe('toPrice', () => {
  it('accepts positive finite numbers and numeric strings', () => {
    expect(toPrice(10.5)).toBe(10.5);
    expect(toPrice('190.25')).toBe(190.25);
  });

  it('treats null, empty, zero, negative and non-numeric as no price', () => {
    for (const value of [null, undefined, '', 0, -3, NaN, Infinity, 'abc']) {
      expect(toPrice(value)).toBeNull();
    }
  });
});
