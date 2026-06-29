import { describe, expect, it } from 'vitest';

import {
  alignByDate,
  alignManyByDate,
  alpha,
  annualizedVol,
  backtest,
  beta,
  bootstrapMC,
  calmar,
  correlation,
  correlationMatrix,
  covarianceMatrix,
  cvar,
  drawdownSeries,
  efficientFrontier,
  ewmaVol,
  gmvWeights,
  historicalVaR,
  hurst,
  invertMatrix,
  kellyFraction,
  kurtosis,
  logReturns,
  maxDrawdown,
  mean,
  monteCarloGBM,
  parametricVaR,
  returnHistogram,
  rollingBeta,
  rollingCorrelation,
  rollingSharpe,
  rollingVol,
  sharpe,
  simpleReturns,
  skewness,
  sortino,
  stdDev,
  tangencyWeights,
  volPercentile,
  volTargetWeight,
} from './quantUtils';

describe('building blocks', () => {
  it('simpleReturns: prices -> fractional day-over-day change', () => {
    expect(simpleReturns([100, 110, 99])).toEqual([0.1, -0.1]);
  });

  it('logReturns: ln(today/yesterday)', () => {
    const [r] = logReturns([100, 110]);
    expect(r).toBeCloseTo(Math.log(1.1), 10);
  });

  it('mean: arithmetic average', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
  });

  it('stdDev: sample standard deviation (n-1), to match Python statistics.stdev', () => {
    // deviations from mean 2 are -1,0,1 -> var = (1+0+1)/(3-1) = 1 -> sd = 1
    expect(stdDev([1, 2, 3])).toBeCloseTo(1, 10);
  });
});

describe('annualizedVol — must match Python _annualized_volatility', () => {
  it('flat price line -> 0', () => {
    expect(annualizedVol([50, 50, 50, 50])).toBe(0);
  });

  it('known series -> simple returns, sample stdev, x sqrt(252) x 100', () => {
    // closes [100,110,105]: returns 0.1 and -0.0454545; sample sd ~0.1028519
    // 0.1028519 * sqrt(252) * 100 ~= 163.27
    expect(annualizedVol([100, 110, 105])).toBeCloseTo(163.27, 1);
  });

  it('fewer than 2 returns -> null', () => {
    expect(annualizedVol([100])).toBeNull();
    expect(annualizedVol([])).toBeNull();
  });
});

describe('maxDrawdown — must match Python _max_drawdown', () => {
  it('[100, 50, 75] -> -50', () => {
    expect(maxDrawdown([100, 50, 75])).toBeCloseTo(-50, 10);
  });

  it('always-rising series -> 0', () => {
    expect(maxDrawdown([10, 20, 30, 40])).toBe(0);
  });
});

describe('rollingVol', () => {
  it('flat series -> all zeros, non-empty', () => {
    const out = rollingVol([10, 10, 10, 10, 10], 2);
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

describe('ewmaVol', () => {
  it('flat series -> 0', () => {
    expect(ewmaVol([20, 20, 20, 20, 20])).toBe(0);
  });

  it('volatile series -> positive finite percentage', () => {
    const v = ewmaVol([100, 110, 95, 120, 90, 130]);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThan(0);
  });
});

describe('VaR / CVaR', () => {
  // 20 returns, worst five: -0.05..-0.01. 95% -> 5th percentile index = floor(0.05*20)=1.
  const returns = Array.from({ length: 20 }, (_, i) => (i - 10) / 100); // -0.10 .. 0.09

  it('historicalVaR is the (1-alpha) percentile return, negative', () => {
    expect(historicalVaR(returns)).toBeLessThan(0);
  });

  it('cvar <= historicalVaR (the tail mean is at least as bad as its cutoff)', () => {
    expect(cvar(returns)).toBeLessThanOrEqual(historicalVaR(returns));
  });

  it('parametricVaR is finite and negative for a spread series', () => {
    const v = parametricVaR(returns);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeLessThan(0);
  });

  it('too-few returns -> null', () => {
    expect(historicalVaR([0.01])).toBeNull();
    expect(cvar([])).toBeNull();
  });
});

describe('sharpe / sortino', () => {
  it('flat (zero-variance) returns -> null, not Infinity', () => {
    expect(sharpe([0, 0, 0, 0])).toBeNull();
    expect(sortino([0.01, 0.01, 0.01])).toBeNull(); // no downside -> null
  });

  it('positive-drift series -> positive ratios', () => {
    const r = [0.01, -0.005, 0.02, 0.01, -0.002, 0.015];
    expect(sharpe(r)).toBeGreaterThan(0);
    expect(sortino(r)).toBeGreaterThan(0);
  });
});

describe('monteCarloGBM', () => {
  it('sigma = 0 -> every ending equals spot * exp(mu * days) (no randomness)', () => {
    const spot = 100;
    const mu = 0.001;
    const days = 50;
    const { terminal } = monteCarloGBM(spot, mu, 0, days, 200, 7);
    const expected = spot * Math.exp(mu * days);
    for (const end of terminal) expect(end).toBeCloseTo(expected, 6);
  });

  it('same seed -> identical output (reproducible, no leaking Math.random)', () => {
    const a = monteCarloGBM(100, 0.0005, 0.02, 30, 500, 42);
    const b = monteCarloGBM(100, 0.0005, 0.02, 30, 500, 42);
    expect(a.terminal).toEqual(b.terminal);
    expect(a.percentiles).toEqual(b.percentiles);
  });

  it('different seed -> different output', () => {
    const a = monteCarloGBM(100, 0.0005, 0.02, 30, 500, 1);
    const b = monteCarloGBM(100, 0.0005, 0.02, 30, 500, 2);
    expect(a.terminal).not.toEqual(b.terminal);
  });
});

describe('beta / alpha — benchmark-relative', () => {
  const stockPts = [
    { date: '2024-01-02', close: 100 },
    { date: '2024-01-03', close: 102 },
    { date: '2024-01-04', close: 101 },
    { date: '2024-01-05', close: 104 },
  ];

  it('alignByDate keeps only common days, in stock order', () => {
    const market = [
      { date: '2024-01-03', close: 50 },
      { date: '2024-01-05', close: 52 },
      { date: '2024-01-09', close: 99 }, // not in stock -> dropped
    ];
    const { stock, market: m } = alignByDate(stockPts, market);
    expect(stock).toEqual([102, 104]);
    expect(m).toEqual([50, 52]);
  });

  it('beta of a series against itself is 1', () => {
    const r = simpleReturns([100, 102, 101, 104, 103]);
    expect(beta(r, r)).toBeCloseTo(1, 10);
  });

  it('beta scales: stock = 2x market moves -> beta 2', () => {
    const market = [0.01, -0.02, 0.015, -0.005];
    const stock = market.map((x) => 2 * x);
    expect(beta(stock, market)).toBeCloseTo(2, 10);
  });

  it('alpha is ~0 when stock == market and rf consistent', () => {
    const r = simpleReturns([100, 103, 101, 105, 104]);
    expect(alpha(r, r, 0)).toBeCloseTo(0, 10);
  });

  it('too-few / non-overlapping -> null', () => {
    expect(beta([0.01], [0.01])).toBeNull();
    expect(alpha([], [], 0)).toBeNull();
  });
});

describe('returnHistogram', () => {
  it('bins sum to the input count', () => {
    const hist = returnHistogram([-0.02, -0.01, 0, 0.01, 0.02], 5);
    expect(hist.reduce((a, b) => a + b.count, 0)).toBe(5);
  });

  it('empty input -> empty', () => {
    expect(returnHistogram([])).toEqual([]);
  });
});

describe('distribution shape', () => {
  it('skewness ~0 for a symmetric series', () => {
    expect(skewness([-2, -1, 0, 1, 2])).toBeCloseTo(0, 10);
  });

  it('skewness positive when the right tail is longer', () => {
    expect(skewness([0, 0, 0, 0, 10])).toBeGreaterThan(0);
  });

  it('kurtosis is excess (normal-ish uniform -> negative)', () => {
    expect(kurtosis([-2, -1, 0, 1, 2])).toBeLessThan(0);
  });
});

describe('drawdownSeries', () => {
  it('underwater curve is 0 at new peaks and negative below', () => {
    expect(drawdownSeries([100, 120, 90])).toEqual([0, 0, -25]);
  });
});

describe('calmar', () => {
  it('null when there is no drawdown', () => {
    expect(calmar([10, 20, 30, 40])).toBeNull();
  });

  it('finite for a series that rises then dips', () => {
    const closes = Array.from({ length: 300 }, (_, i) => 100 + i - (i > 250 ? 30 : 0));
    expect(Number.isFinite(calmar(closes))).toBe(true);
  });
});

describe('rolling series', () => {
  it('rollingSharpe yields one value per full window', () => {
    const r = Array.from({ length: 10 }, (_, i) => (i % 2 ? 0.01 : -0.005));
    expect(rollingSharpe(r, 5).length).toBe(6);
  });

  it('rollingBeta of a series against itself is ~1', () => {
    const r = simpleReturns(Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i)));
    const out = rollingBeta(r, r, 30).filter((x) => x != null);
    expect(out[0]).toBeCloseTo(1, 8);
  });
});

describe('hurst / regime', () => {
  it('hurst of a strong trend exceeds 0.5', () => {
    const trend = Array.from({ length: 200 }, (_, i) => i * 0.01);
    expect(hurst(trend)).toBeGreaterThan(0.5);
  });

  it('volPercentile of a rising series puts the last value at the top', () => {
    expect(volPercentile([1, 2, 3, 4, 5])).toBe(100);
  });
});

describe('position sizing', () => {
  it('kellyFraction = mean / variance', () => {
    const r = [0.01, 0.02, -0.01, 0.03, -0.02];
    expect(kellyFraction(r)).toBeCloseTo(mean(r) / stdDev(r) ** 2, 10);
  });

  it('volTargetWeight halves when realized vol is double target', () => {
    expect(volTargetWeight(30, 15)).toBeCloseTo(0.5, 10);
  });
});

describe('bootstrapMC', () => {
  it('all-zero returns -> every path stays at spot', () => {
    const { terminal } = bootstrapMC(100, [0, 0, 0], 20, 50, 7);
    for (const end of terminal) expect(end).toBeCloseTo(100, 10);
  });

  it('same seed -> reproducible', () => {
    const a = bootstrapMC(100, [0.01, -0.02, 0.015], 30, 200, 3);
    const b = bootstrapMC(100, [0.01, -0.02, 0.015], 30, 200, 3);
    expect(a.terminal).toEqual(b.terminal);
  });
});

describe('backtest', () => {
  // Steadily rising series: SMA-cross is long almost throughout, so it should
  // roughly track buy & hold and post a positive return.
  const rising = Array.from({ length: 120 }, (_, i) => 100 + i);

  it('produces an equity curve aligned to the price series', () => {
    const res = backtest(rising, 'sma', { fast: 10, slow: 30 });
    expect(res.equity.length).toBe(rising.length);
    expect(res.finalReturn).toBeGreaterThan(0);
  });

  it('too-short series -> null', () => {
    expect(backtest([1, 2, 3], 'momentum')).toBeNull();
  });
});

describe('correlation', () => {
  it('a series correlates +1 with itself', () => {
    const r = [0.01, -0.02, 0.015, -0.005, 0.02];
    expect(correlation(r, r)).toBeCloseTo(1, 10);
  });

  it('a series correlates -1 with its negation', () => {
    const r = [0.01, -0.02, 0.015, -0.005, 0.02];
    expect(correlation(r, r.map((x) => -x))).toBeCloseTo(-1, 10);
  });

  it('rollingCorrelation yields one value per full window', () => {
    const a = Array.from({ length: 10 }, (_, i) => i);
    expect(rollingCorrelation(a, a, 5).length).toBe(6);
  });
});

describe('alignManyByDate', () => {
  it('keeps only days present in every series', () => {
    const series = [
      { symbol: 'A', points: [{ date: '2024-01-02', close: 1 }, { date: '2024-01-03', close: 2 }] },
      { symbol: 'B', points: [{ date: '2024-01-03', close: 9 }, { date: '2024-01-04', close: 8 }] },
    ];
    const { dates, closes } = alignManyByDate(series);
    expect(dates).toEqual(['2024-01-03']);
    expect(closes).toEqual({ A: [2], B: [9] });
  });
});

describe('matrices + optimizer', () => {
  it('correlationMatrix has a unit diagonal and is symmetric', () => {
    const m = correlationMatrix(['A', 'B'], { A: [0.01, -0.02, 0.03], B: [-0.01, 0.02, -0.03] });
    expect(m[0][0]).toBe(1);
    expect(m[1][1]).toBe(1);
    expect(m[0][1]).toBeCloseTo(m[1][0], 10);
  });

  it('invertMatrix inverts a 2x2 (A·A⁻¹ ≈ I)', () => {
    const A = [
      [4, 7],
      [2, 6],
    ];
    const inv = invertMatrix(A);
    const prod = A.map((row, i) => inv[0].map((_, j) => row[0] * inv[0][j] + row[1] * inv[1][j]));
    expect(prod[0][0]).toBeCloseTo(1, 8);
    expect(prod[1][1]).toBeCloseTo(1, 8);
    expect(prod[0][1]).toBeCloseTo(0, 8);
  });

  it('singular matrix -> null', () => {
    expect(invertMatrix([[1, 2], [2, 4]])).toBeNull();
  });

  it('gmvWeights sum to 1', () => {
    const cov = covarianceMatrix([
      [0.01, -0.02, 0.015, -0.005],
      [0.02, 0.01, -0.01, 0.005],
    ]);
    const w = gmvWeights(cov);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
  });

  it('tangencyWeights sum to 1 and frontier returns annualized points', () => {
    const rets = [
      [0.01, -0.02, 0.015, -0.005, 0.02],
      [0.005, 0.01, -0.008, 0.012, -0.003],
    ];
    const cov = covarianceMatrix(rets);
    const mu = rets.map(mean);
    const w = tangencyWeights(cov, mu);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 8);
    const frontier = efficientFrontier(cov, mu);
    expect(frontier.length).toBeGreaterThan(0);
    expect(Number.isFinite(frontier[0].vol)).toBe(true);
  });
});
