import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MOCK_FINANCIAL_HIGHLIGHTS } from '../../../dev/mockData';
import FinancialHighlightsTable from './FinancialHighlightsTable';

describe('FinancialHighlightsTable', () => {
  afterEach(() => cleanup());

  it('renders title, backend period headers, rows, and unavailable values', () => {
    const { container } = render(
      <FinancialHighlightsTable financialHighlights={MOCK_FINANCIAL_HIGHLIGHTS} />
    );

    expect(screen.getByText('Key Financial Highlights')).toBeTruthy();
    expect(screen.queryByText('Unit')).toBeNull();
    expect(screen.queryByText('FY 2022')).toBeNull();
    expect(screen.getAllByText('FY 2023').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Q1 2026').length).toBeGreaterThan(0);
    expect(
      Array.from(container.querySelectorAll('thead')[0].querySelectorAll('th')).map(
        (cell) => cell.textContent
      )
    ).toEqual(['Metric', 'Q1 2026', 'FY 2025', 'FY 2024', 'FY 2023']);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getAllByText(/Mn/).length).toBeGreaterThan(0);
    expect(screen.getByText('Latest Market Snapshot')).toBeTruthy();
    expect(screen.getByText('Market & Scale')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('Profitability')).toBeTruthy();
    expect(screen.getByText('Per Share & Balance Sheet')).toBeTruthy();
    expect(screen.getByText('Dividends')).toBeTruthy();
    expect(screen.getByText('VALUATION MULTIPLES')).toBeTruthy();
    expect(screen.getByText('QUALITY OF EARNINGS')).toBeTruthy();
    expect(screen.getByText('BALANCE SHEET RISK')).toBeTruthy();
    expect(screen.getByText('DIVIDEND QUALITY')).toBeTruthy();
    expect(screen.getByText(/Currency: USD \(US Dollar\)/)).toBeTruthy();
    expect(screen.getByText('126.00 %')).toBeTruthy();
    expect(screen.getByText('0.45x')).toBeTruthy();
    expect(screen.queryByText('Source unavailable')).toBeNull();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    expect(
      Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
        (cell) => cell.textContent
      )
    ).toEqual([
      'Revenue',
      'EBITDA',
      'Net Profit',
      'Revenue Growth (%)',
      'Net Profit Growth (%)',
      'EBITDA Margin (%)',
      'Net Profit Margin / Profit Margin (%)',
      'ROE (%)',
      'EPS',
      'BVPS',
      'DER',
      'Dividend Yield (%)',
      'Payout Ratio (%)',
      'Market Cap',
      'Enterprise Value',
      'P/E',
      'P/BV',
      'P/S',
      'EV/EBITDA',
      'CFO / Net Income',
      'Free Cash Flow',
      'Capex Intensity (%)',
      'DER',
      'Net Debt',
      'Debt / EBITDA',
      'Cash Ratio',
      'Equity Ratio',
      'Dividend Yield',
      'Payout Ratio',
      'FCF Coverage',
    ]);
  });


  it('renders grouped metric tables with latest value, growth, and status columns', () => {
    const rowKeys = new Set(['revenue', 'revenue_growth']);
    const groupedPayload = {
      ...MOCK_FINANCIAL_HIGHLIGHTS,
      point_in_time: [],
      sections: [
        {
          key: 'income',
          title: 'Income',
          groups: [
            {
              key: 'revenue_gross_profit',
              title: 'Revenue & Gross Profit',
              rows: MOCK_FINANCIAL_HIGHLIGHTS.rows.filter((row) => rowKeys.has(row.key)),
            },
          ],
        },
      ],
    };

    const { container } = render(<FinancialHighlightsTable financialHighlights={groupedPayload} />);

    expect(screen.getByText('Income')).toBeTruthy();
    expect(screen.getByText('Revenue & Gross Profit')).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll('thead')[0].querySelectorAll('th')).map(
        (cell) => cell.textContent
      )
    ).toEqual(['Metric', 'Q1 2026', 'FY 2025', 'FY 2024', 'FY 2023']);
    expect(screen.getByText('208,700.0 Mn')).toBeTruthy();
    expect(screen.getByText('59.90 %')).toBeTruthy();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });

  it('returns null when payload is missing', () => {
    const { container } = render(<FinancialHighlightsTable financialHighlights={null} />);

    expect(container.firstChild).toBeNull();
  });
});
