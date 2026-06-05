import { describe, expect, it } from 'vitest';

import {
  getMockAnalysisResponseByRequestId,
  MOCK_RESPONSES_BY_REQUEST_ID,
  mockConflictDataQuality,
  resolveDisplaySignal,
} from '../dev/mockData';

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

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
    expect(result.financial_highlights.periods.map((period) => period.label)).toEqual([
      'FY22',
      'FY23',
      'FY24',
      'FY25',
      'Q1 2026',
    ]);
    expect(result.normalized_period_rows[0].period).toMatchObject({
      period_label: 'FY2024',
      as_of_date: '2025-03-31',
      currency: 'IDR',
      unit: 'raw',
    });
    expect(result.financial_highlights.rows).toHaveLength(13);
    expect(result.financial_highlights.sections).toHaveLength(5);
    expect(result.financial_highlights.point_in_time[0]).toMatchObject({
      key: 'market_cap',
      unit: 'USD Mn',
    });
    expect(result.valuation_multiples.interpretation.primary_method).toBe('EV/EBITDA');
    expect(result.fair_value_range.metric_details.base.display).toBe('USD 940');
    expect(result.scenario_analysis.base.upside_downside_display).toBe('2.17%');
    expect(result.quality_of_earnings.rating).toBe('healthy');
    expect(result.balance_sheet_risk.risk_level).toBe('low');
    expect(result.dividend_quality.sustainability).toBe('sustainable');
    expect(result.peer_comparison.metrics).toHaveLength(2);
    expect(result.company_profile).toMatchObject({
      available: true,
      ticker: 'NVDA',
      company_name: 'NVIDIA Corporation',
    });
    expect(result.analysis_overview).toMatchObject({
      recommendation: 'Buy',
      confidence: 'High Conviction',
    });
    expect(result).toMatchObject({
      id: 'mock-nvda-buy',
      input_ticker: 'NVDA',
      normalized_ticker: 'NVDA',
      display_signal: 'BUY',
      raw_ai_signal: 'BUY',
      price_is_fallback: false,
      market_status: 'closed',
    });
    expect(result.agent_pipeline).toHaveLength(10);
    expect(result.technical_levels).toHaveProperty('current_price');
    expect(result.data_sources.price.provider).toBe('Yahoo Finance');
    expect(result.data_freshness.price.freshness_status).toBe('fresh');
    expect(result.analysis_params.normalized_ticker).toBe('NVDA');
    expect(result.tab_status.analysis).toBe('ok');
    expect(result.price_chart).toMatchObject({
      available: true,
      ticker: 'NVDA',
      trade_date: '2026-05-18',
      lookback_days: 120,
    });
    expect(result.price_chart.points).toHaveLength(120);
    expect(result.price_chart.data).toHaveLength(120);
    expect(result.price_chart.points[0]).toHaveProperty('adjusted_close');
    expect(result.price_performance).toHaveProperty('period_return_percent');
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
    expect(result.technical_entry).toMatchObject({
      available: true,
    });
    expect(result.news_impact).toMatchObject({
      available: true,
      overall_sentiment: 'neutral',
    });
    expect(result.news_impact.high_impact_news.length).toBeGreaterThan(0);
    expect(result.catalyst_tracker.positive_catalysts.length).toBeGreaterThan(0);
    expect(result.analyst_consensus).toMatchObject({
      available: true,
      total: 18,
    });
    expect(result.risk_data_quality).toMatchObject({
      risk_summary: {
        overall_risk: 'moderate',
      },
      data_quality: {
        confidence: 'high',
      },
    });
    expect(result.risk_data_quality.vendor_status.yfinance.status).toBe('success');
    expect(result.risk_data_quality.missing_fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          module: 'financial_highlights',
          field: 'payout_ratio',
        }),
      ])
    );
    expect(result.risk_data_quality.calculation_notes).toContain(
      'Risk/reward ratio = expected upside / expected downside'
    );
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
      'mock-ptro-wait-no-position',
      'mock-tpia-reduce-existing-position',
      'mock-bbca-buy-no-position',
      'mock-bbri-hold-existing-position',
      'mock-tlkm-sell-existing-position',
    ]);
  });

  it('maps raw AI signal into position-aware display signal', () => {
    expect(resolveDisplaySignal('BUY', false, 'Open new position')).toBe('BUY');
    expect(resolveDisplaySignal('BUY', false, 'No position to rebalance')).toBe('WAIT');
    expect(resolveDisplaySignal('HOLD', false, 'No position to rebalance')).toBe('WAIT');
    expect(resolveDisplaySignal('BUY', true, 'Maintain position')).toBe('HOLD');
    expect(resolveDisplaySignal('SELL', true, 'Trim position')).toBe('REDUCE');
    expect(resolveDisplaySignal('SELL', true, 'Exit position')).toBe('SELL');
  });

  it('covers WAIT, REDUCE, BUY, HOLD, and SELL mock scenarios', () => {
    const scenarios = {
      'mock-bbca-buy-no-position': {
        display_signal: 'BUY',
        rebalancing_action: 'Open new position',
        new_entry_action: 'Allowed with validated entry',
      },
      'mock-bbri-hold-existing-position': {
        display_signal: 'HOLD',
        rebalancing_action: 'Maintain position',
        new_entry_action: 'No new entry; maintain existing position',
      },
      'mock-tlkm-sell-existing-position': {
        display_signal: 'SELL',
        rebalancing_action: 'Exit position',
        new_entry_action: 'No new entry; exit existing position',
      },
      'mock-ptro-wait-no-position': {
        display_signal: 'WAIT',
        rebalancing_action: 'No position to rebalance',
        new_entry_action: 'Wait for valid entry setup',
      },
      'mock-tpia-reduce-existing-position': {
        display_signal: 'REDUCE',
        rebalancing_action: 'Trim position',
        new_entry_action: 'Do not add; reduce existing exposure',
      },
    };

    for (const [requestId, expected] of Object.entries(scenarios)) {
      const result = getMockAnalysisResponseByRequestId(requestId);
      expect(result.display_signal).toBe(expected.display_signal);
      expect(result.rebalancing_action).toBe(expected.rebalancing_action);
      expect(result.new_entry_action).toBe(expected.new_entry_action);
      expect(result.position_size_hint).toBeTruthy();
      expect(result.agent_pipeline).toHaveLength(10);
      expect(result.data_sources.price.provider).toBe('Yahoo Finance');
      expect(result.technical_levels.technical_levels_available).toBe(true);
      expect(result.analysis_params.normalized_ticker).toBe(result.normalized_ticker);
    }
  });

  it('keeps mock analysis response schema complete for WAIT scenario', () => {
    const requiredFields = [
      'id',
      'input_ticker',
      'normalized_ticker',
      'company_name',
      'exchange',
      'currency',
      'market',
      'horizon',
      'created_at',
      'last_price',
      'price_currency',
      'price_source',
      'price_timestamp',
      'price_is_fallback',
      'market_status',
      'raw_ai_signal',
      'display_signal',
      'has_existing_position',
      'signal_context',
      'confidence_score',
      'confidence_label',
      'confidence_tier',
      'confidence_breakdown',
      'volatility_score',
      'volatility_scale',
      'volatility_method',
      'volatility_lookback_days',
      'volatility_classification',
      'executive_summary',
      'investment_thesis',
      'mini_risk_summary',
      'action_status',
      'new_entry_action',
      'position_size_hint',
      'key_reasons',
      'key_reasons_paragraph',
      'key_catalysts',
      'invalidation_conditions',
      'technical_levels',
      'agent_pipeline',
      'total_pipeline_seconds',
      'data_sources',
      'data_freshness',
      'analysis_params',
      'tab_status',
      'profile',
      'fundamentals',
      'chart_price',
      'news',
      'risk_data_quality',
      'disclaimer',
    ];
    const result = getMockAnalysisResponseByRequestId('mock-ptro-wait-no-position');

    for (const field of requiredFields) {
      expect(result).toHaveProperty(field);
    }
  });

  it('mock responses provide a key reasons paragraph between 75 and 125 words when present', () => {
    const responses = [
      getMockAnalysisResponseByRequestId('mock-nvda-buy'),
      getMockAnalysisResponseByRequestId('mock-tsla-sell'),
      getMockAnalysisResponseByRequestId('mock-aapl-hold'),
      getMockAnalysisResponseByRequestId('mock-ptro-wait-no-position'),
      getMockAnalysisResponseByRequestId('mock-tpia-reduce-existing-position'),
    ];

    for (const response of responses) {
      expect(response.key_reasons_paragraph).toBeTruthy();
      expect(countWords(response.key_reasons_paragraph)).toBeGreaterThanOrEqual(75);
      expect(countWords(response.key_reasons_paragraph)).toBeLessThanOrEqual(125);
      expect(response.analysis_overview.key_reasons_paragraph).toBe(response.key_reasons_paragraph);
    }
  });

  it('provides mock conflict data quality for vendor mismatch UI', () => {
    expect(mockConflictDataQuality.field_quality.last_price).toMatchObject({
      status: 'conflict',
      source: 'yfinance',
      vendor_values: {
        yfinance: 1000,
        finnhub: 1060,
      },
    });
    expect(mockConflictDataQuality.field_quality.last_price.warnings[0]).toContain(
      'last_price conflict'
    );
  });

  it('returns cloned mock objects so tests cannot mutate the registry', () => {
    const first = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    first.ticker = 'BROKEN';

    const second = getMockAnalysisResponseByRequestId('mock-nvda-buy');
    expect(second.ticker).toBe('NVDA');
  });
});
