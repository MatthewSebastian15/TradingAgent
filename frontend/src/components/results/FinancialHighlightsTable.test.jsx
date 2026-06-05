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
    expect(screen.getAllByText('Unit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FY22').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FY23').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FY26Q1').length).toBeGreaterThan(0);
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getAllByText('USD Mn').length).toBeGreaterThan(0);
    expect(screen.getByText('Latest Market Snapshot')).toBeTruthy();
    expect(screen.getByText('Market & Scale')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('Profitability')).toBeTruthy();
    expect(screen.getByText('Per Share & Balance Sheet')).toBeTruthy();
    expect(screen.getByText('Dividends')).toBeTruthy();
    expect(screen.getByText(/Currency: USD \(US Dollar\)/)).toBeTruthy();
    expect(screen.getByText('126.00%')).toBeTruthy();
    expect(screen.getByText('0.45x')).toBeTruthy();
    expect(screen.getAllByText('Source unavailable').length).toBeGreaterThan(0);
    expect(screen.getAllByText('x').length).toBeGreaterThan(0);
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
    ]);
  });

  it('returns null when payload is missing', () => {
    const { container } = render(<FinancialHighlightsTable financialHighlights={null} />);

    expect(container.firstChild).toBeNull();
  });
});
