import { describe, expect, it } from 'vitest';

import { buildQuantSnapshot, chatbotPrompt, dataStatus, interpretSummary, snapshotText } from './interpret';

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

describe('quant snapshot', () => {
  const snapshot = buildQuantSnapshot({
    symbol: 'AAPL',
    windowLabel: '2025-09-12 → 2026-09-11 · 251 obs',
    summary: 'AAPL has moved about 25.0% a year.',
    rows: [
      { label: 'Sharpe', value: '1.20' },
      { label: 'Beta vs S&P 500', value: '—' },
    ],
  });

  it('drops empty rows and formats plain text', () => {
    expect(snapshot.rows).toEqual([{ label: 'Sharpe', value: '1.20' }]);
    expect(snapshotText(snapshot)).toBe(
      'AAPL · 2025-09-12 → 2026-09-11 · 251 obs\nAAPL has moved about 25.0% a year.\nSharpe: 1.20\nResearch only — not advice.'
    );
  });

  it('asks the chatbot to explain, not to recommend', () => {
    const prompt = chatbotPrompt(snapshot);
    expect(prompt).toContain('Explain these quant readings for AAPL');
    expect(prompt).toContain('Sharpe: 1.20');
    expect(prompt).toContain('Do not give buy or sell advice.');
  });
});
