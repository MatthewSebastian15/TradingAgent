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
    expect(screen.getByText('FY23')).toBeTruthy();
    expect(screen.getByText('FY26Q1')).toBeTruthy();
    expect(screen.getByText('Revenue')).toBeTruthy();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
    expect(
      Array.from(container.querySelectorAll('tbody tr td:first-child')).map(
        (cell) => cell.textContent
      )
    ).toEqual([
      'Revenue',
      'Revenue Growth (%)',
      'EBITDA',
      'EBITDA Margin (%)',
      'Net Profit',
      'Net Profit Growth (%)',
      'Net Profit Margin (%)',
      'ROE (%)',
      'EPS',
      'BVPS',
      'DER',
      'Dividend Yield (%)',
    ]);
  });

  it('returns null when payload is missing', () => {
    const { container } = render(<FinancialHighlightsTable financialHighlights={null} />);

    expect(container.firstChild).toBeNull();
  });
});
