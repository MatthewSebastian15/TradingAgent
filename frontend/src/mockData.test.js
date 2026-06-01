import { describe, expect, it } from 'vitest';

import { getMockAnalysisResponseByRequestId, MOCK_RESPONSES_BY_REQUEST_ID } from '../dev/mockData';

describe('mockData', () => {
  it('returns complete mock result by request id', () => {
    const result = getMockAnalysisResponseByRequestId('mock-nvda-buy');

    expect(result).toMatchObject({
      request_id: 'mock-nvda-buy',
      ticker: 'NVDA',
      market: 'US',
      final_decision: 'Buy',
      current_price_source: 'mock:yfinance:last_close',
      llm_calls_used: 0,
      llm_call_budget: 0,
    });
    expect(result.agents_used.length).toBeGreaterThan(0);
    expect(result.data_quality.warnings[0]).toContain('Mock data only');
    expect(result.financial_highlights.periods.map((period) => period.key)).toEqual([
      'FY23',
      'FY24',
      'FY25',
      'FY26Q1',
    ]);
    expect(result.financial_highlights.rows).toHaveLength(12);
    expect(result.company_profile).toMatchObject({
      available: true,
      ticker: 'NVDA',
      name: 'NVIDIA Corporation',
    });
    expect(result.price_chart).toMatchObject({
      available: true,
      ticker: 'NVDA',
      trade_date: '2026-05-18',
      lookback_days: 120,
    });
    expect(result.price_chart.points).toHaveLength(120);
    expect(result.price_chart.points.some((point) => point.close >= point.open)).toBe(true);
    expect(result.price_chart.points.some((point) => point.close < point.open)).toBe(true);
    expect(result.price_chart.stats.high).toBe(
      Math.max(...result.price_chart.points.map((point) => point.high))
    );
    expect(result.price_chart.stats.low).toBe(
      Math.min(...result.price_chart.points.map((point) => point.low))
    );
    expect(result.news).toMatchObject({
      enabled: true,
      ticker: 'NVDA',
      articles_found: 2,
    });
    expect(result.news.articles.map((article) => article.provider)).toEqual([
      'marketaux',
      'newsdata',
    ]);
    expect(result.related_news).toMatchObject({
      available: true,
      ticker: 'NVDA',
      trade_date: '2026-05-18',
      lookback_days: 90,
    });
    expect(result.related_news.items).toHaveLength(3);
  });

  it('supports required direct mock routes', () => {
    expect(Object.keys(MOCK_RESPONSES_BY_REQUEST_ID)).toEqual([
      'mock-nvda-buy',
      'mock-tsla-sell',
      'mock-aapl-hold',
      'mock-missing-price',
      'mock-meta-repaired-buy',
      'mock-bbca-id-buy',
      'mock-unvr-news-unavailable-sell',
    ]);
  });

  it('returns cloned mock objects so tests cannot mutate the registry', () => {
    const first = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    first.ticker = 'BROKEN';

    const second = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    expect(second.ticker).toBe('NVDA');
  });
});
