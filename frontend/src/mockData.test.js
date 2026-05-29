import { describe, expect, it } from 'vitest';

import {
  getMockAnalysisResponseByRequestId,
  MOCK_RESPONSES_BY_REQUEST_ID,
} from './mockData';

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
  });

  it('supports required direct mock routes', () => {
    expect(Object.keys(MOCK_RESPONSES_BY_REQUEST_ID)).toEqual([
      'mock-nvda-buy',
      'mock-tsla-sell',
      'mock-aapl-hold',
      'mock-missing-price',
      'mock-meta-repaired-buy',
      'mock-bbca-id-buy',
    ]);
  });

  it('returns cloned mock objects so tests cannot mutate the registry', () => {
    const first = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    first.ticker = 'BROKEN';

    const second = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    expect(second.ticker).toBe('NVDA');
  });
});
