import '@testing-library/jest-dom/vitest';

import { render, screen, within } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import TickerNewsList from './TickerNewsList';

const companyArticle = {
  title: 'Bank Central Asia Reports Profit Growth',
  url: 'https://example.com/bbca-profit',
  provider: 'google_news_light',
  source: 'Example News',
  published_at: '2026-06-20T08:00:00Z',
  relevance_score: 88,
  summary: 'Bank Central Asia reports higher net profit.',
  relevance_reasons: ['company_name_in_title', 'market_moving_keyword'],
  matched_terms: ['Bank Central Asia', 'BBCA'],
  entity_match: 'company_exact',
  bucket: 'decision_company_news',
  relevance_category: 'company_specific',
  decision_filter_reason: 'company_news_passed',
};

const marketArticle = {
  title: 'IHSG weakens on Fed concern',
  url: 'https://example.com/ihsg-fed',
  provider: 'rss_context',
  source: 'Market RSS',
  relevance_score: 42,
  market_context_only: true,
};

describe('TickerNewsList', () => {
  it('does not show market context as company-specific news', () => {
    render(
      <TickerNewsList
        decisionCompanyNews={[]}
        marketContextNews={[marketArticle]}
        strictNewsFilter={{ enabled: true }}
      />
    );

    const companySection = screen.getByText('Company-specific News').closest('.rounded-md');
    const contextSection = screen.getByText('Market Context').closest('.rounded-md');

    expect(within(companySection).getByText(/No company-specific news/i)).toBeInTheDocument();
    expect(within(companySection).queryByText('IHSG weakens on Fed concern')).not.toBeInTheDocument();
    expect(within(contextSection).getByText('IHSG weakens on Fed concern')).toBeInTheDocument();
    expect(screen.getByText('Market Context, not direct company evidence')).toBeInTheDocument();
  });

  it('renders provider status and strict filter summary', () => {
    render(
      <TickerNewsList
        decisionCompanyNews={[companyArticle]}
        marketContextNews={[marketArticle]}
        providerStatus={{ google_news_light: 'success', marketaux: 'missing_api_key' }}
        strictNewsFilter={{
          decision_company_news_count: 1,
          market_context_news_count: 1,
          excluded_news_count: 3,
          rss_decision_min_relevance_score: 80,
        }}
      />
    );

    expect(screen.getByText('1 used for AI')).toBeInTheDocument();
    expect(screen.getByText('1 market context')).toBeInTheDocument();
    expect(screen.getByText('3 excluded')).toBeInTheDocument();
    expect(screen.getByText('RSS threshold 80')).toBeInTheDocument();
    expect(screen.getByText(/google_news_light/i)).toBeInTheDocument();
    expect(screen.getByText(/marketaux/i)).toBeInTheDocument();
  });

  it('renders relevance score and debug reasons', () => {
    render(<TickerNewsList decisionCompanyNews={[companyArticle]} debug />);

    expect(screen.getByText(/Score 88/i)).toBeInTheDocument();
    expect(screen.getByText(/Reason: company_name_in_title, market_moving_keyword/i)).toBeInTheDocument();
    expect(screen.getByText(/Matched: Bank Central Asia, BBCA/i)).toBeInTheDocument();
    expect(screen.getByText(/entity_match: company_exact/i)).toBeInTheDocument();
  });
});
