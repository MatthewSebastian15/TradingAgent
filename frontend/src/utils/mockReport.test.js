import { describe, expect, it } from 'vitest';

import { MOCK_HOLD_RESPONSE, MOCK_RESPONSE } from '../mockData';
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
});
