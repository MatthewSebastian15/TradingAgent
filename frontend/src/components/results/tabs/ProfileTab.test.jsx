import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ProfileTab from './ProfileTab';

function profile(website = 'https://example.com/about') {
  return {
    available: true,
    company_name: 'Example Corporation',
    ticker: 'EXM',
    currency: 'USD',
    country: 'United States',
    sector: 'Technology',
    industry: 'Software',
    market_cap: 1200000000,
    current_price: 42,
    employee_count: 1200,
    website,
    description: 'Example Corporation builds market software for institutional users.',
    executives: [
      { name: 'Executive One', title: 'CEO' },
      { name: 'Executive Two', title: 'CFO' },
    ],
    shareholders: [{ name: 'Holder One', ownership: 0.12, shares: 120000, source: 'YFinance' }],
    shares_ownership: {
      shares_out: 1000,
      insider_pct: 0.25,
      institution_pct: 0.5,
      short_ratio: null,
    },
  };
}

function result(overrides = {}) {
  return {
    ticker: 'EXM',
    ...overrides,
  };
}

describe('ProfileTab', () => {
  afterEach(() => cleanup());

  it('renders an HTTP website as an external link', () => {
    const { container } = render(<ProfileTab profile={profile()} result={result()} />);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/about');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'renders an unsafe website as text without a link',
    (website) => {
      const { container } = render(<ProfileTab profile={profile(website)} result={result()} />);

      expect(screen.getByText(website)).toBeTruthy();
      expect(container.querySelector('a')).toBeNull();
    }
  );

  it('renders the compact company profile table without current price', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('COMPANY PROFILE')).toBeInTheDocument();
    expect(screen.getByText('Company Name')).toBeInTheDocument();
    expect(screen.getByText('Example Corporation')).toBeInTheDocument();
    expect(screen.getByText('Ticker')).toBeInTheDocument();
    expect(screen.getByText('EXM')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.getByText('USD')).toBeInTheDocument();
    expect(screen.getByText('Market Cap')).toBeInTheDocument();
    expect(screen.getByText('$1,200,000,000')).toBeInTheDocument();
    expect(screen.queryByText('Current Price')).toBeNull();
  });

  it('renders shares ownership table and a non-black ownership chart legend', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('SHARES & OWNERSHIP')).toBeInTheDocument();
    expect(screen.getByText('Shares Outstanding')).toBeInTheDocument();
    expect(screen.getByText('1,000')).toBeInTheDocument();
    expect(screen.getAllByText('Insider Ownership').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Institutional Ownership').length).toBeGreaterThan(0);
    expect(screen.getAllByText('25.00%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('50.00%').length).toBeGreaterThan(0);
    expect(
      screen.getByRole('img', { name: /ownership composition pie chart/i })
    ).toBeInTheDocument();
  });

  it('renders business description, executives, and shareholders when available', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('BUSINESS DESCRIPTION')).toBeInTheDocument();
    expect(screen.getByText(/builds market software/i)).toBeInTheDocument();
    expect(screen.getByText('KEY EXECUTIVES')).toBeInTheDocument();
    expect(screen.getByText('Executive One')).toBeInTheDocument();
    expect(screen.getByText('CEO')).toBeInTheDocument();
    expect(screen.getByText('SHAREHOLDERS')).toBeInTheDocument();
    expect(screen.getByText('Holder One')).toBeInTheDocument();
    expect(screen.getByText('YFinance')).toBeInTheDocument();
  });
});
