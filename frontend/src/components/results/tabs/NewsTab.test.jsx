import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import NewsTab from './NewsTab';

function makeArticle(prefix, index, overrides = {}) {
  return {
    title: `${prefix} Article ${index}`,
    source: 'idx-news-vendor-with-long-label',
    publisher: 'IDX News',
    published_at: `2026-06-${String(index).padStart(2, '0')}`,
    sentiment: 'neutral',
    impact: 'medium',
    impact_score: 60 + index,
    relevance_score: 70 + index,
    materiality_category: 'corporate_action',
    source_confidence_label: 'verified_exchange',
    source_confidence_score: 0.95,
    news_scope: 'company',
    scope_label: 'company',
    impact_reason: `${prefix} article ${index} matters because it affects the analysis window.`,
    summary: `${prefix} article ${index} summary.`,
    url: `https://example.com/${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    normalized_url: `https://example.com/${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    normalized_title: `${prefix.toLowerCase()} article ${index}`,
    dedupe_key: `${prefix.toLowerCase().replace(/\s+/g, '-')}-${index}`,
    is_high_impact: prefix === 'High Impact',
    ...overrides,
  };
}

function makeNewsResult({ highImpactCount = 0, fullCount = 0 } = {}) {
  const highImpactNews = Array.from({ length: highImpactCount }, (_, index) =>
    makeArticle('High Impact', index + 1, {
      impact: 'high',
      impact_score: 90 + index,
      is_high_impact: true,
    })
  );
  const fullNewsList = Array.from({ length: fullCount }, (_, index) =>
    makeArticle('Full News', index + 1, {
      impact: 'low',
      impact_score: 30 + index,
      is_high_impact: false,
    })
  );

  return {
    ticker: 'GOTO.JK',
    related_news: {
      source: 'backend-news-pipeline',
      summary: 'News summary for GOTO.JK.',
      lookback_days: 14,
      total_fetched: highImpactCount + fullCount,
      items: [],
    },
    news_impact: {
      high_impact_news: highImpactNews,
      full_news_list: fullNewsList,
      high_impact_count: highImpactCount,
      full_news_count: fullCount,
      news_count: highImpactCount + fullCount,
      deduplicated_count: highImpactCount + fullCount,
      duplicate_excluded_count: 0,
      overall_sentiment: 'neutral',
      sentiment_score: 0,
      data_quality: {
        sources_used: ['idx', 'vendor'],
        source_confidence_breakdown: {
          verified_exchange: highImpactCount + fullCount,
          unknown: 0,
        },
      },
    },
    catalyst_tracker: {},
    analyst_consensus: {},
  };
}

function makeNewsResultWithMarketContext() {
  const result = makeNewsResult({ highImpactCount: 1, fullCount: 2 });
  result.news_impact.full_news_list.push(
    makeArticle('Market Context', 1, {
      title: 'Asian Markets Rally on US Inflation Data',
      scope_label: 'market_context',
      news_scope: 'market_context',
      materiality_category: 'macro_market',
      url: 'https://example.com/asian-markets-rally',
      normalized_url: 'https://example.com/asian-markets-rally',
      dedupe_key: 'asian-markets-rally',
    }),
    makeArticle('Market Context', 2, {
      title: 'Jakarta Composite Tracks Regional Risk Appetite',
      scope_label: 'market_context',
      news_scope: 'market_context',
      materiality_category: 'index_market',
      url: 'https://example.com/jakarta-composite-risk',
      normalized_url: 'https://example.com/jakarta-composite-risk',
      dedupe_key: 'jakarta-composite-risk',
    })
  );
  result.news_impact.news_count += 2;
  result.news_impact.deduplicated_count += 2;
  return result;
}

describe('NewsTab', () => {
  afterEach(() => cleanup());

  it('renders all high impact news without display limit', () => {
    render(<NewsTab result={makeNewsResult({ highImpactCount: 7, fullCount: 0 })} />);

    expect(screen.getByText('High Impact Article 1')).toBeInTheDocument();
    expect(screen.getByText('High Impact Article 7')).toBeInTheDocument();
    expect(screen.getAllByText(/NEWS #/i).length).toBeGreaterThanOrEqual(7);
  });

  it('renders all full news list items without display limit', () => {
    render(<NewsTab result={makeNewsResult({ highImpactCount: 0, fullCount: 11 })} />);

    expect(screen.getByText('Full News Article 1')).toBeInTheDocument();
    expect(screen.getByText('Full News Article 11')).toBeInTheDocument();
  });

  it('does not render full news item that already exists in high impact news', () => {
    const result = makeNewsResult({ highImpactCount: 1, fullCount: 2 });
    result.news_impact.full_news_list.push({
      ...result.news_impact.high_impact_news[0],
      is_high_impact: false,
    });

    render(<NewsTab result={result} />);

    expect(screen.getAllByText(result.news_impact.high_impact_news[0].title)).toHaveLength(1);
  });

  it('renders market context items inside full news list with scope label', () => {
    render(<NewsTab result={makeNewsResultWithMarketContext()} />);

    expect(screen.getByText('Asian Markets Rally on US Inflation Data')).toBeInTheDocument();
    expect(screen.getAllByText(/Scope: MARKET CONTEXT/i).length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to related news only when news impact full list is missing', () => {
    const result = {
      ticker: 'GOTO.JK',
      related_news: {
        items: [{ title: 'Legacy Related News', url: 'https://example.com/legacy' }],
      },
      news_impact: {
        high_impact_news: [],
      },
    };

    render(<NewsTab result={result} />);

    expect(screen.getByText('Legacy Related News')).toBeInTheDocument();
  });

  it('does not fallback to related news when backend sends an empty full_news_list', () => {
    const result = {
      ticker: 'GOTO.JK',
      related_news: {
        items: [{ title: 'Legacy Related News', url: 'https://example.com/legacy' }],
      },
      news_impact: {
        high_impact_news: [
          {
            title: 'Only High Impact',
            url: 'https://example.com/high',
            dedupe_key: 'high',
          },
        ],
        full_news_list: [],
      },
    };

    render(<NewsTab result={result} />);

    expect(screen.getByText('Only High Impact')).toBeInTheDocument();
    expect(screen.queryByText('Legacy Related News')).not.toBeInTheDocument();
  });
});
