import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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
    website,
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
    display_signal: 'BUY',
    confidence_score: 82,
    current_price: 42,
    entry_price: 40,
    stop_loss: 35,
    take_profit: 55,
    risk_reward_display: '1:3',
    position_size_hint: 'Staged entry',
    suggested_allocation_percent: 6,
    investment_thesis:
      'The bull case says growth remains resilient. The bear case is that valuation can compress. The action plan is staged.',
    analysis_overview: {
      risk_summary: {
        overall_risk: 'moderate',
        short_reason: 'Volatility requires position discipline.',
      },
    },
    scenario_analysis: {
      bear: { summary: 'Downside scenario' },
      base: { summary: 'Base scenario' },
      bull: { summary: 'Upside scenario' },
    },
    data_quality: {
      price_data: 'partial',
      news: 'missing',
      fundamentals: 'ok',
    },
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

  it('renders the shadcn profile header and trade-level metrics', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('EXM')).toBeInTheDocument();
    expect(screen.getByText('Example Corporation')).toBeInTheDocument();
    expect(screen.getByText('BUY')).toBeInTheDocument();
    expect(screen.getByText('82%')).toBeInTheDocument();
    expect(screen.getByText('Entry price')).toBeInTheDocument();
    expect(screen.getByText('$40')).toBeInTheDocument();
    expect(screen.getByText('Risk/reward ratio')).toBeInTheDocument();
    expect(screen.getByText('1:3')).toBeInTheDocument();
    expect(screen.getByText('Suggested allocation percent')).toBeInTheDocument();
    expect(screen.getByText('6%')).toBeInTheDocument();
  });

  it('renders thesis, risk summary, scenario analysis, and supports thesis collapse', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('Investment thesis')).toBeInTheDocument();
    expect(screen.getByText('Bull thesis')).toBeInTheDocument();
    expect(screen.getByText('Bear thesis')).toBeInTheDocument();
    expect(screen.getByText(/Volatility requires position discipline/i)).toBeInTheDocument();
    expect(screen.getByText('BEAR')).toBeInTheDocument();
    expect(screen.getByText('BASE')).toBeInTheDocument();
    expect(screen.getByText('BULL')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /hide/i }));

    expect(screen.queryByText('Bull thesis')).toBeNull();
  });

  it('renders and dismisses non-ok data quality warnings', () => {
    render(<ProfileTab profile={profile()} result={result()} />);

    expect(screen.getByText('Data quality warnings')).toBeInTheDocument();
    expect(screen.getByText(/price data: partial/i)).toBeInTheDocument();
    expect(screen.getByText(/news: missing/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /dismiss data quality warnings/i }));

    expect(screen.queryByText('Data quality warnings')).toBeNull();
  });
});
