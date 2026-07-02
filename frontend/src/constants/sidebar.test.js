import { describe, expect, it } from 'vitest';

import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from './sidebar';

describe('sidebar constants', () => {
  it('exposes tailwind width classes with collapsed narrower than expanded', () => {
    const px = (cls) => Number(cls.match(/^w-\[(\d+)px\]$/)[1]);

    expect(px(SIDEBAR_COLLAPSED_WIDTH)).toBeLessThan(px(SIDEBAR_EXPANDED_WIDTH));
  });
});
