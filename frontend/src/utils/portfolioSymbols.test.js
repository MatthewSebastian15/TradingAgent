import { describe, expect, it } from 'vitest';

import { symbolsForTab } from './portfolioSymbols';

const tracked = [{ ticker: 'nvda' }, { ticker: 'AAPL' }, { ticker: 'AAPL' }];
const holdings = [{ ticker: 'bbca.jk' }, { ticker: ' MSFT ' }, { ticker: '' }];

describe('symbolsForTab', () => {
  it('uses tracked tickers on the AI tab, deduped, upper-cased and sorted', () => {
    expect(symbolsForTab('ai', { tracked, holdings })).toEqual(['AAPL', 'NVDA']);
  });

  it('uses holdings tickers on the holdings tab and drops blanks', () => {
    expect(symbolsForTab('holdings', { tracked, holdings })).toEqual(['BBCA.JK', 'MSFT']);
  });

  it('is order independent so batch membership is stable', () => {
    const forward = symbolsForTab('holdings', { holdings: [{ ticker: 'A' }, { ticker: 'B' }] });
    const reversed = symbolsForTab('holdings', { holdings: [{ ticker: 'B' }, { ticker: 'A' }] });
    expect(forward).toEqual(reversed);
  });

  it('returns an empty list when nothing is passed', () => {
    expect(symbolsForTab('ai')).toEqual([]);
  });
});
