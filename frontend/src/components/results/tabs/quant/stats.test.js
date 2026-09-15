import { describe, expect, it } from 'vitest';

import { ewmaSigmaDaily } from './stats';

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
