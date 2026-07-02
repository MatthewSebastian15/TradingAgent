import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import FundamentalTab from './FundamentalTab';

const HIGHLIGHTS = {
  title: 'KEY FINANCIAL HIGHLIGHTS',
  currency: 'USD',
  periods: [
    { key: 'fy2023', label: 'FY 2023' },
    { key: 'fy2024', label: 'FY 2024' },
  ],
  rows: [
    {
      key: 'revenue',
      label: 'Revenue',
      format_type: 'currency_scaled',
      values: {
        fy2023: { value: 90, display: '90.0', status: 'reported' },
        fy2024: { value: 100, display: '100.0', status: 'reported' },
      },
    },
  ],
};

describe('FundamentalTab', () => {
  afterEach(() => cleanup());

  it('renders group and view-mode selectors with income/table active by default', () => {
    render(<FundamentalTab financialHighlights={HIGHLIGHTS} result={{}} />);

    for (const label of ['Income', 'Balance Sheet', 'Cash Flow', 'Ratios']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'Income' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Table' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the highlights table with mapped metric rows in table mode', () => {
    render(<FundamentalTab financialHighlights={HIGHLIGHTS} result={{}} />);

    expect(screen.getAllByText('Revenue').length).toBeGreaterThan(0);
    expect(screen.getByText('FY 2024')).toBeTruthy();
  });

  it('switches fundamental groups', () => {
    render(<FundamentalTab financialHighlights={HIGHLIGHTS} result={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ratios' }));

    expect(screen.getByRole('button', { name: 'Ratios' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Income' }).getAttribute('aria-pressed')).toBe(
      'false'
    );
  });

  it('renders income charts in chart mode', () => {
    render(<FundamentalTab financialHighlights={HIGHLIGHTS} result={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chart' }));

    expect(screen.getByText('Revenue, EBITDA, Net Profit')).toBeTruthy();
  });

  it('shows the missing-data notice per chart when no fundamental data exists', () => {
    render(<FundamentalTab financialHighlights={{ periods: [], rows: [] }} result={{}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chart' }));

    expect(screen.getAllByText('No fundamental data available').length).toBeGreaterThan(0);
  });
});
