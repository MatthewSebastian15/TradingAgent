import { describe, expect, it } from 'vitest';

import { mergeTickerResults, searchLocalTickers } from './tickerSearch';

describe('tickerSearch', () => {
  it('exact symbol match ranks first', () => {
    expect(searchLocalTickers('AAPL', 5)[0].symbol).toBe('AAPL');
  });

  it('symbol prefix match appears before name contains match', () => {
    const results = searchLocalTickers('BB', 10).map((item) => item.symbol);

    expect(results.indexOf('BBCA.JK')).toBeLessThan(results.indexOf('ABBV'));
  });

  it('BB returns IDX bank tickers', () => {
    expect(searchLocalTickers('BB', 6).map((item) => item.symbol)).toEqual([
      'BBCA.JK',
      'BBRI.JK',
      'BBNI.JK',
      'BBTN.JK',
      'BMRI.JK',
      'BRIS.JK',
    ]);
  });

  it('apple returns AAPL', () => {
    expect(searchLocalTickers('apple', 1)[0].symbol).toBe('AAPL');
  });

  it('BTC returns BTC-USD', () => {
    expect(searchLocalTickers('BTC', 1)[0].symbol).toBe('BTC-USD');
  });

  it('manual fallback appears for valid unknown symbol', () => {
    expect(searchLocalTickers('META2', 1)[0]).toMatchObject({
      symbol: 'META2',
      source: 'manual_symbol',
    });
  });

  it('market filter filters result', () => {
    expect(
      searchLocalTickers('bank', 10, { market: 'ID' }).every((item) => item.market === 'ID')
    ).toBe(true);
  });

  it('type filter filters result', () => {
    expect(searchLocalTickers('SPY', 10, { type: 'ETF' })[0]).toMatchObject({
      symbol: 'SPY',
      type: 'ETF',
    });
  });

  it('mergeTickerResults dedupes by symbol', () => {
    expect(
      mergeTickerResults(
        [{ symbol: 'aapl', name: 'Apple' }],
        [{ symbol: 'AAPL', name: 'Duplicate' }]
      )
    ).toHaveLength(1);
  });
});
