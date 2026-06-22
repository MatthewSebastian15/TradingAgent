import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearRecentTickers,
  readRecentTickers,
  removeRecentTicker,
  saveRecentTicker,
} from './recentTickers';

describe('recentTickers', () => {
  beforeEach(() => {
    localStorage.clear();
    clearRecentTickers();
  });

  it('saves selected ticker', () => {
    saveRecentTicker({
      symbol: 'bbca.jk',
      name: 'Bank Central Asia',
      exchange: 'IDX',
      type: 'EQUITY',
      market: 'ID',
    });

    expect(readRecentTickers()[0]).toMatchObject({ symbol: 'BBCA.JK', source: 'recent' });
  });

  it('moves duplicate symbol to top', () => {
    saveRecentTicker({ symbol: 'AAPL' });
    saveRecentTicker({ symbol: 'MSFT' });
    saveRecentTicker({ symbol: 'AAPL', name: 'Apple Inc' });

    expect(readRecentTickers().map((item) => item.symbol)).toEqual(['AAPL', 'MSFT']);
  });

  it('limits recent tickers to 20', () => {
    for (let index = 0; index < 25; index += 1) {
      saveRecentTicker({ symbol: `AAA${index}` });
    }

    expect(readRecentTickers({ limit: 25 })).toHaveLength(20);
  });

  it('removes ticker by symbol', () => {
    saveRecentTicker({ symbol: 'AAPL' });
    saveRecentTicker({ symbol: 'MSFT' });

    removeRecentTicker('aapl');

    expect(readRecentTickers().map((item) => item.symbol)).toEqual(['MSFT']);
  });

  it('clears recent tickers', () => {
    saveRecentTicker({ symbol: 'AAPL' });

    clearRecentTickers();

    expect(readRecentTickers()).toEqual([]);
  });

  it('handles localStorage error safely', () => {
    const getSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(readRecentTickers()).toEqual([]);

    getSpy.mockRestore();
  });
});
