import { describe, expect, it } from 'vitest';

import { TICKER_SEARCH_UNIVERSE } from './tickerUniverse';

describe('TICKER_SEARCH_UNIVERSE', () => {
  it('is a frozen, non-empty list with the required fields on every entry', () => {
    expect(Object.isFrozen(TICKER_SEARCH_UNIVERSE)).toBe(true);
    expect(TICKER_SEARCH_UNIVERSE.length).toBeGreaterThan(0);

    for (const entry of TICKER_SEARCH_UNIVERSE) {
      expect(entry.symbol).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.exchange).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.market).toBeTruthy();
    }
  });

  it('has no duplicate symbols', () => {
    const symbols = TICKER_SEARCH_UNIVERSE.map((entry) => entry.symbol);

    expect(new Set(symbols).size).toBe(symbols.length);
  });
});
