import { describe, expect, it } from 'vitest';

import {
  MARKET_DEFAULT_SYMBOLS,
  MARKET_MAX_SYMBOLS,
  MARKET_PRESETS,
  defaultSymbolsForCategory,
  labelForMarketSymbol,
  normalizeMarketSymbol,
} from './marketDefaults';

describe('normalizeMarketSymbol', () => {
  it('trims and uppercases', () => {
    expect(normalizeMarketSymbol('  btc-usd ')).toBe('BTC-USD');
    expect(normalizeMarketSymbol(null)).toBe('');
  });
});

describe('defaultSymbolsForCategory', () => {
  it('returns first MAX symbols for a known category', () => {
    expect(defaultSymbolsForCategory('FX')).toEqual(
      MARKET_PRESETS.FX.slice(0, MARKET_MAX_SYMBOLS).map((i) => i.symbol)
    );
  });

  it('falls back to EQUITIES for unknown category', () => {
    expect(defaultSymbolsForCategory('NOPE')).toEqual(MARKET_DEFAULT_SYMBOLS);
  });

  it('caps at MARKET_MAX_SYMBOLS', () => {
    expect(defaultSymbolsForCategory('EQUITIES')).toHaveLength(MARKET_MAX_SYMBOLS);
  });
});

describe('labelForMarketSymbol', () => {
  it('finds the preset label across categories', () => {
    expect(labelForMarketSymbol('^GSPC')).toBe('S&P 500');
    expect(labelForMarketSymbol('btc-usd')).toBe('BITCOIN');
    expect(labelForMarketSymbol('GC=F')).toBe('GOLD');
  });

  it('returns the normalized symbol when unknown', () => {
    expect(labelForMarketSymbol(' aapl ')).toBe('AAPL');
  });
});
