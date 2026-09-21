import { describe, expect, it } from 'vitest';

import { alpha, benchmarkForSymbol, marketKeyForSymbol, resolveRiskFreeRate } from './benchmark';

describe('alpha annualization', () => {
  it('scales linearly with ppy', () => {
    const market = [0.01, -0.02, 0.015, -0.005, 0.012];
    const stock = market.map((x, i) => 1.3 * x + (i % 2 ? 0.001 : 0.002));
    expect(alpha(stock, market, 0, 365) / alpha(stock, market, 0)).toBeCloseTo(365 / 252, 10);
  });
});

describe('marketKeyForSymbol', () => {
  it('returns the known suffix or US', () => {
    expect(marketKeyForSymbol('BBCA.JK')).toBe('JK');
    expect(marketKeyForSymbol('AAPL')).toBe('US');
    expect(marketKeyForSymbol('FOO.ZZ')).toBe('US');
    expect(marketKeyForSymbol('BTC-USD')).toBe('US');
    expect(benchmarkForSymbol('0700.HK').symbol).toBe('^HSI');
  });

  it.each(['X.CONSTRUCTOR', 'X.TOSTRING', 'X.__PROTO__', 'X.HASOWNPROPERTY'])(
    'does not treat inherited Object keys as a market (%s)',
    (sym) => {
      expect(marketKeyForSymbol(sym)).toBe('US');
      expect(benchmarkForSymbol(sym).symbol).toBe('^GSPC');
    }
  );
});

describe('resolveRiskFreeRate', () => {
  const status = { quant_risk_free_rate: 0.04, quant_risk_free_rates: { JK: 0.06 } };

  it('prefers the market rate, then the global rate, then 0', () => {
    expect(resolveRiskFreeRate('BBCA.JK', status)).toEqual({
      rate: 0.06,
      source: 'market',
      market: 'JK',
    });
    expect(resolveRiskFreeRate('AAPL', status)).toEqual({
      rate: 0.04,
      source: 'global',
      market: 'US',
    });
    expect(resolveRiskFreeRate('AAPL', null)).toEqual({ rate: 0, source: 'none', market: 'US' });
  });
});
