import { describe, expect, it } from 'vitest';

import { alpha, beta } from './benchmark';
import { historicalVaR, sharpe } from './risk';
import { benchmarkStats, bootstrapCI, horizonReturns, scaleVaR, sharpeStats } from './riskStats';
import { mean, stdDev } from './stats';

const market = Array.from(
  { length: 120 },
  (_, i) => 0.01 * Math.sin(i / 3) + (i % 5 === 0 ? -0.004 : 0.001)
);

describe('horizon helpers', () => {
  it('horizonReturns are overlapping k-day returns', () => {
    const out = horizonReturns([100, 110, 121, 133.1], 2);
    expect(out).toHaveLength(2);
    out.forEach((r) => expect(r).toBeCloseTo(0.21, 12));
  });

  it('scaleVaR applies square-root-of-time', () => {
    expect(scaleVaR(-2, 10)).toBeCloseTo(-2 * Math.sqrt(10), 12);
    expect(scaleVaR(null, 10)).toBeNull();
  });
});

describe('bootstrapCI', () => {
  it('brackets the point estimate and is reproducible', () => {
    const a = bootstrapCI(market, (s) => historicalVaR(s));
    const b = bootstrapCI(market, (s) => historicalVaR(s));
    expect(a).toEqual(b);
    expect(a.lo).toBeLessThanOrEqual(historicalVaR(market));
    expect(a.hi).toBeGreaterThanOrEqual(historicalVaR(market) - 1e-12);
    expect(bootstrapCI(market.slice(0, 10), mean)).toBeNull();
  });

  it('is null when fewer than half the resamples produce a finite stat', () => {
    let call = 0;
    const flaky = () => {
      call += 1;
      return call % 3 === 0 ? 1 : NaN;
    };
    expect(bootstrapCI(market, flaky)).toBeNull();
  });
});

describe('benchmarkStats', () => {
  it('matches beta/alpha and is exact for a 2x levered stock', () => {
    const stock = market.map((x) => 2 * x);
    const s = benchmarkStats(stock, market, 0);
    expect(s.beta).toBeCloseTo(beta(stock, market), 10);
    expect(s.alpha).toBeCloseTo(alpha(stock, market, 0), 8);
    expect(s.rSquared).toBeCloseTo(1, 10);
    expect(s.alphaTStat).toBeNull();
    expect(s.trackingError).toBeCloseTo(stdDev(market) * Math.sqrt(252) * 100, 10);
    expect(s.upCapture).toBeCloseTo(200, 8);
    expect(s.downCapture).toBeCloseTo(200, 8);
  });

  it('noise lowers R² below 1 and yields a finite alpha t-stat', () => {
    const stock = market.map((x, i) => x + (i % 2 ? 0.004 : -0.003));
    const s = benchmarkStats(stock, market, 0);
    expect(s.rSquared).toBeGreaterThan(0);
    expect(s.rSquared).toBeLessThan(1);
    expect(Number.isFinite(s.alphaTStat)).toBe(true);
  });

  it('needs 20 overlapping returns', () => {
    expect(benchmarkStats(market.slice(0, 10), market.slice(0, 10))).toBeNull();
  });

  it('capture ratios are null, not NaN/Infinity, when the market never moves one way', () => {
    const flatUpMarket = market.map((v) => Math.abs(v) + 0.001);
    const stock = flatUpMarket.map((x) => 2 * x);
    const s = benchmarkStats(stock, flatUpMarket, 0);
    expect(s.downCapture).toBeNull();
    expect(Number.isNaN(s.downCapture)).toBe(false);
  });
});

describe('sharpeStats', () => {
  const returns = market.map((x) => x + 0.001);

  it('reports the same Sharpe and a PSR in (0, 1)', () => {
    const s = sharpeStats(returns, 0);
    expect(s.sharpe).toBeCloseTo(sharpe(returns, 0), 10);
    expect(s.probabilisticSharpe).toBeGreaterThan(0);
    expect(s.probabilisticSharpe).toBeLessThan(1);
  });

  it('more data with the same shape tightens the standard error', () => {
    const short = sharpeStats(returns, 0);
    const long = sharpeStats([...returns, ...returns, ...returns, ...returns], 0);
    expect(long.standardError).toBeLessThan(short.standardError);
  });

  it('flat returns (zero stdDev) return null rather than NaN', () => {
    const flat = Array.from({ length: 30 }, () => 0);
    expect(sharpeStats(flat, 0)).toBeNull();
  });

  it('a non-positive variance term returns null-safe SE/tStat/PSR, not NaN', () => {
    // The adjusted sample kurtosis can dip below the population floor (g4 < 1) for a
    // bimodal series; combined with a far-off rf that inflates |sr|, the Mertens
    // variance term goes negative. Confirmed via scratch calculation before writing this.
    const bimodal = [...Array(8).fill(1), ...Array(12).fill(0.001)];
    const s = sharpeStats(bimodal, -5);
    expect(s).not.toBeNull();
    expect(Number.isFinite(s.sharpe)).toBe(true);
    expect(s.standardError).toBeNull();
    expect(s.tStat).toBeNull();
    expect(s.probabilisticSharpe).toBeNull();
    expect(Number.isNaN(s.sharpe)).toBe(false);
  });
});
