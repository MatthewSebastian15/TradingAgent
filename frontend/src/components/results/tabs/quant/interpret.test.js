import { describe, expect, it } from 'vitest';

import { dataStatus, interpretSummary } from './interpret';

describe('interpretSummary', () => {
  it('reads volatility, drawdown, beta and Sharpe in plain language', () => {
    const text = interpretSummary({
      symbol: 'BBCA.JK',
      vol: 28.4,
      regimeLabel: 'Stressed',
      currentDrawdown: -12.3,
      underwaterDays: 41,
      beta: 1.3,
      benchLabel: 'IDX Composite',
      sharpe: 0.42,
      sharpeTStat: 0.9,
      observations: 502,
    });
    expect(text).toBe(
      'BBCA.JK has moved about 28.4% a year, above its usual range for this stock. ' +
        'It trades 12.3% below its peak in this window and has not recovered for 41 days. ' +
        'Beta 1.30 vs IDX Composite: it has swung more than the index. ' +
        'Risk-adjusted return (Sharpe 0.42) is positive but not statistically different from zero. ' +
        'Research only — not advice.'
    );
  });

  it('skips missing inputs and warns on short samples', () => {
    const text = interpretSummary({
      symbol: 'X',
      vol: null,
      currentDrawdown: -0.2,
      observations: 60,
    });
    expect(text).toBe(
      'It trades at or near its peak for this window. Only 60 observations — treat these readings as low confidence. Research only — not advice.'
    );
  });
});

describe('dataStatus', () => {
  it('is OK without problems and LIMITED with reasons otherwise', () => {
    expect(dataStatus({ issues: [], benchStatus: 'ready', overviewError: null })).toEqual({
      label: 'OK',
      reasons: [],
    });
    expect(
      dataStatus({
        issues: [{ code: 'stale_prices' }, { code: 'calendar_gap' }],
        benchStatus: 'unavailable',
        overviewError: 'x',
      })
    ).toEqual({
      label: 'LIMITED',
      reasons: ['2 data warnings', 'benchmark unavailable', 'fundamentals unavailable'],
    });
    expect(dataStatus({ benchStatus: 'loading' }).label).toBe('OK');
  });
});
