import { describe, expect, it } from 'vitest';

import {
  MOCK_HOLD_RESPONSE,
  MOCK_PTRO_WAIT_RESPONSE,
  MOCK_RESPONSE,
  MOCK_TPIA_REDUCE_SCENARIO_RESPONSE,
} from '../../dev/mockData';
import { buildMockActionPlanRows, buildMockReportContext, buildMockReportHtml } from './mockReport';

function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function makeMockNewsItem(prefix, index, overrides = {}) {
  return {
    title: `${prefix} GOTO News ${index}`,
    source: 'MarketAux',
    publisher: 'MarketAux',
    published_at: `2026-06-${String(index).padStart(2, '0')}`,
    sentiment: 'neutral',
    impact: prefix === 'High Impact' ? 'high' : 'medium',
    impact_score: prefix === 'High Impact' ? 90 + index : 45 + index,
    relevance_score: prefix === 'High Impact' ? 90 : 70,
    materiality_category: prefix === 'High Impact' ? 'corporate_action' : 'sector',
    source_confidence_label: prefix === 'High Impact' ? 'HIGH' : 'MEDIUM',
    news_scope: 'company',
    scope_label: 'COMPANY',
    impact_reason: `${prefix} item ${index} is relevant for mock report testing.`,
    summary: `${prefix} summary ${index}.`,
    url: `https://example.com/${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    normalized_url: `example.com/${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    normalized_title: `${prefix.toLowerCase()} goto news ${index}`,
    dedupe_key: `${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    is_high_impact: prefix === 'High Impact',
    ...overrides,
  };
}

function makeMockResultWithNews({ highImpactCount = 0, fullCount = 0 } = {}) {
  const highImpactNews = Array.from({ length: highImpactCount }, (_, index) =>
    makeMockNewsItem('High Impact', index + 1)
  );
  const fullNewsList = Array.from({ length: fullCount }, (_, index) =>
    makeMockNewsItem('Full News', index + 1, { is_high_impact: false })
  );

  return {
    ticker: 'GOTO.JK',
    market: 'ID',
    related_news: {
      source: 'backend-news-pipeline',
      summary: 'News summary for GOTO.JK.',
      lookback_days: 14,
      total_fetched: highImpactCount + fullCount,
      items: [],
    },
    news_impact: {
      available: true,
      high_impact_news: highImpactNews,
      full_news_list: fullNewsList,
      high_impact_count: highImpactCount,
      full_news_count: fullCount,
      news_count: highImpactCount + fullCount,
      deduplicated_count: highImpactCount + fullCount,
      duplicate_excluded_count: 0,
      overall_sentiment: 'neutral',
      sentiment_score: 52,
      data_quality: {
        sources_used: ['MarketAux'],
        rules: {
          high_impact_limited: false,
          full_news_limited: false,
          high_impact_removed_from_full_list: true,
        },
      },
    },
    catalyst_tracker: {},
    analyst_consensus: {},
  };
}

function makeMockResultWithMarketContext() {
  const result = makeMockResultWithNews({ highImpactCount: 1, fullCount: 2 });
  result.news_impact.full_news_list.push(
    makeMockNewsItem('Market Context', 1, {
      title: 'Market Context News 1',
      scope_label: 'MARKET CONTEXT',
      news_scope: 'market_context',
      materiality_category: 'market_context',
      dedupe_key: 'market-context-1',
      normalized_url: 'example.com/market-context-1',
    })
  );
  result.news_impact.full_news_count += 1;
  result.news_impact.news_count += 1;
  result.news_impact.deduplicated_count += 1;
  return result;
}

describe('mockReport', () => {
  it('builds 12 action plan metrics in the required order', () => {
    const rows = buildMockActionPlanRows(MOCK_RESPONSE);

    expect(rows.map((row) => row.label)).toEqual([
      'Current Price',
      'Entry',
      'Stop Loss',
      'Take Profit',
      'Max Drawdown',
      'Volatility',
      'Volatility Score',
      'Rebalancing',
      'Position Action',
      'New Entry Action',
      'Position Size Hint',
      'R/R Ratio',
    ]);
    expect(rows).toHaveLength(12);
  });

  it('does not render removed fields in mock HTML report', () => {
    const html = buildMockReportHtml({
      ...MOCK_RESPONSE,
      price_target: 1200,
      risk_per_share: 40,
      reward_per_share: 120,
    });

    expect(html).toContain('TradingAgent Mock Analysis Report');
    expect(html).toContain('Action Plan');
    expect(html).not.toContain('Price Target');
    expect(html).not.toContain('Risk Per Share');
    expect(html).not.toContain('Reward Per Share');
  });

  it('renders full mock contract sections for WAIT and REDUCE signals without Key Levels', () => {
    const waitHtml = buildMockReportHtml(MOCK_PTRO_WAIT_RESPONSE);
    const reduceHtml = buildMockReportHtml(MOCK_TPIA_REDUCE_SCENARIO_RESPONSE);

    expect(waitHtml).toContain('PTRO.JK');
    expect(waitHtml).toContain('WAIT');
    expect(waitHtml).toContain('No position to rebalance');
    expect(waitHtml).toContain('Wait for valid entry setup');
    expect(waitHtml).toContain('Confidence Breakdown');
    expect(waitHtml).toContain('Low Conviction');
    expect(waitHtml).toContain('Volatility Metadata');
    expect(waitHtml).not.toContain('Key Levels');
    expect(waitHtml).toContain('Agent Pipeline');
    expect(waitHtml).toContain('Data Sources');
    expect(waitHtml).toContain('Data Freshness');
    expect(waitHtml).toContain('Yahoo Finance');
    expect(reduceHtml).toContain('TPIA.JK');
    expect(reduceHtml).toContain('REDUCE');
    expect(reduceHtml).toContain('Trim position');
    expect(reduceHtml).toContain('Do not add; reduce existing exposure');
    expect(reduceHtml).not.toContain('Key Levels');
  });

  it('renders Hold report without fake trade levels', () => {
    const html = buildMockReportHtml({
      ...MOCK_HOLD_RESPONSE,
      entry_price: 190,
      stop_loss: 180,
      take_profit: 220,
      risk_reward_display: '1:3',
    });

    expect(html).toContain('No actionable trade plan is available');
    expect(html).not.toContain('<div class="metric-label">Entry</div>');
    expect(html).not.toContain('<div class="metric-label">Stop Loss</div>');
    expect(html).not.toContain('<div class="metric-label">Take Profit</div>');
  });

  it('builds all high impact news items without limit', () => {
    const result = makeMockResultWithNews({ highImpactCount: 7, fullCount: 0 });
    const report = buildMockReportContext(result);

    expect(report.high_impact_news_items).toHaveLength(7);
    expect(report.high_impact_news_items[6].title).toContain('7');
  });

  it('builds all full news list items without limit', () => {
    const result = makeMockResultWithNews({ highImpactCount: 0, fullCount: 11 });
    const report = buildMockReportContext(result);

    expect(report.full_news_items).toHaveLength(11);
    expect(report.full_news_items[10].title).toContain('11');
  });

  it('keeps market context items in full news list', () => {
    const result = makeMockResultWithMarketContext();
    const report = buildMockReportContext(result);

    expect(report.full_news_items.some((item) => item.news_scope === 'MARKET CONTEXT')).toBe(true);
  });

  it('renders the last high impact and full news item in report html', () => {
    const result = makeMockResultWithNews({ highImpactCount: 7, fullCount: 11 });
    const html = buildMockReportHtml(result);

    expect(html).toContain('High Impact GOTO News 7');
    expect(html).toContain('Full News GOTO News 11');
  });

  it('renders the mock report disclaimer in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_HOLD_RESPONSE);

    expect(html).toContain('Disclaimer');
    expect(html).toContain('mock analysis report');
    expect(html).toContain('dummy data');
    expect(html).toContain('Do not use mock report output');
    expect(html).not.toContain('Read full disclaimer');
    expect(html).not.toContain('Hide disclaimer');
  });

  it('renders Key Reasons as a paragraph in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Key Reasons');
    expect(html).not.toContain('<li>+');
    expect(html).not.toContain('<ul class="key-reasons"');

    const match = html.match(/<h2>Key Reasons<\/h2>\s*<p>(.*?)<\/p>/s);
    expect(match).toBeTruthy();

    const text = match[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&');
    expect(countWords(text)).toBeGreaterThanOrEqual(75);
    expect(countWords(text)).toBeLessThanOrEqual(125);
  });

  it('renders static financial highlights in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Key Financial Highlights');
    expect(html).toContain('FY22');
    expect(html).toContain('Q1 2026');
    expect(html).toContain('<th>Unit</th>');
    expect(html).toContain('USD Mn');
    expect(html).toContain('Revenue');
    expect(html).toContain('N/A');
    expect(html).toContain('Currency: USD (US Dollar)');
    expect(html).toContain('Latest Market Snapshot');
    expect(html).toContain('Market &amp; Scale');
  });

  it('renders Phase 2 fundamental sections and hides Peer Comparison without a payload', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);
    const withoutPeer = buildMockReportHtml({ ...MOCK_RESPONSE, peer_comparison: null });

    expect(html).toContain('Financial Trend Analysis');
    expect(html).toContain('<th>Unit</th>');
    expect(html).toContain('Valuation Multiples');
    expect(html).toContain('Fair Value Range');
    expect(html).toContain('Bull / Base / Bear Scenario');
    expect(html).toContain('Quality of Earnings');
    expect(html).toContain('Balance Sheet Risk');
    expect(html).toContain('Dividend Quality');
    expect(html).toContain('Peer Comparison');
    expect(withoutPeer).not.toContain('Peer Comparison');
  });

  it('renders static company profile in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Company Profile');
    expect(html).toContain('NVIDIA Corporation');
    expect(html).toContain('Business Description');
    expect(html).toContain('Key Executives');
    expect(html).toContain('2,300,000.0 USD Mn');
    expect(html).toContain('$940');
  });

  it('renders static Chart & Price summary in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Chart &amp; Price Summary');
    expect(html).toContain('Lookback Days');
    expect(html).toContain('Average Volume');
  });

  it('renders Phase 3 summaries in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Technical Entry Quality');
    expect(html).toContain('News Impact Summary');
    expect(html).toContain('Catalyst Tracker');
    expect(html).toContain('Analyst Recommendation Trend');
  });

  it('renders Phase 4 risk data quality sections in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Risk Summary');
    expect(html).toContain('Market Risk');
    expect(html).toContain('Risk-Adjusted Return');
    expect(html).toContain('Thesis Monitor');
    expect(html).toContain('Source Confidence &amp; Data Quality');
    expect(html).toContain('Vendor Status');
    expect(html).toContain('Calculation Notes');
  });

  it('renders static Full News List items in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Full News List');
    expect(html).toContain('NVDA earnings outlook remains constructive');
    expect(html).toContain('Open original source');
  });

  it('renders Related News text without a link for an unsafe URL', () => {
    const html = buildMockReportHtml({
      ...MOCK_RESPONSE,
      related_news: {
        available: true,
        items: [{ title: 'Unsafe mock URL', url: 'javascript:alert(1)' }],
      },
      news_impact: {
        available: false,
        high_impact_news: [],
        data_quality: { status: 'unavailable', sources_used: [] },
      },
      catalyst_tracker: {
        positive_catalysts: [],
        negative_catalysts: [],
        upcoming_events: [],
        summary: {},
      },
      analyst_consensus: { available: false },
    });

    expect(html).toContain('Unsafe mock URL');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Open original source');
  });
});
