import { describe, expect, it } from 'vitest';

import { MOCK_HOLD_RESPONSE, MOCK_RESPONSE } from '../../dev/mockData';
import { buildMockActionPlanRows, buildMockReportHtml } from './mockReport';

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

  it('renders the mock report disclaimer in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_HOLD_RESPONSE);

    expect(html).toContain('Disclaimer');
    expect(html).toContain('mock analysis report');
    expect(html).toContain('dummy data');
    expect(html).toContain('Do not use mock report output');
  });

  it('renders static financial highlights in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Key Financial Highlights');
    expect(html).toContain('FY26Q1');
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

  it('renders static Related News items in mock HTML output', () => {
    const html = buildMockReportHtml(MOCK_RESPONSE);

    expect(html).toContain('Related News');
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
        full_news_list: [],
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
