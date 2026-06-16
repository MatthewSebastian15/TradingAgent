import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
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

function makeStrictNewsResult({ includeExcluded = true } = {}) {
  return {
    ticker: 'BBCA.JK',
    news_context: {
      decision_company_news: [
        makeArticle('Decision Company', 1, {
          title: 'Bank Central Asia Reports Profit Growth',
          provider: 'marketaux',
          market_context_only: false,
          summary: 'Bank Central Asia reports resilient earnings growth.',
        }),
      ],
      market_context_news: [
        makeArticle('Market Context', 1, {
          title: 'Asian Markets Rise Before Fed Decision',
          provider: 'rss_context',
          market_context_only: true,
          summary: 'Regional markets rose before the Fed decision.',
        }),
      ],
      debug: includeExcluded
        ? {
            strict_news_filter: {
              excluded_news: [
                {
                  title: 'Weak RSS Item Without Company Match',
                  provider: 'rss_context',
                  reason: 'rss_without_company_match',
                  relevance_score: 45,
                },
              ],
            },
          }
        : {},
    },
    analyst_consensus: {},
  };
}

function makeStrictNewsResultWithEmptyMarketContext() {
  return {
    ticker: 'BBCA.JK',
    news_context: {
      decision_company_news: [
        makeArticle('Decision Company', 1, {
          title: 'Bank Central Asia Reports Profit Growth',
          provider: 'marketaux',
          market_context_only: false,
          summary: 'Bank Central Asia reports resilient earnings growth.',
        }),
      ],
      market_context_news: [],
      provider_status: {
        google_news_light: 'empty',
        marketaux: 'success',
        rss_context: 'empty',
      },
      provider_health: {
        rss_context: { status: 'empty' },
      },
      debug: {
        provider_attempts: {
          rss_context: [{ strategy: 'cnbc-business', status: 'empty' }],
        },
      },
    },
    analyst_consensus: {},
  };
}

describe('NewsTab', () => {
  afterEach(() => cleanup());

  it('renders all high impact news without display limit', () => {
    render(<NewsTab result={makeNewsResult({ highImpactCount: 7, fullCount: 0 })} />);

    expect(screen.getByText('NEWS')).toBeInTheDocument();
    expect(screen.queryByText('HIGH-IMPACT NEWS')).not.toBeInTheDocument();
    expect(screen.queryByText('FULL NEWS LIST')).not.toBeInTheDocument();
    expect(screen.getByText('High Impact Article 1')).toBeInTheDocument();
    expect(screen.getByText('High Impact Article 7')).toBeInTheDocument();
    expect(screen.getAllByText('HIGH').length).toBeGreaterThanOrEqual(7);
  });

  it('sorts the unified news list by highest impact first', () => {
    const result = makeNewsResult({ highImpactCount: 0, fullCount: 0 });
    result.news_impact.full_news_list = [
      makeArticle('Low Impact', 1, { impact: 'low', impact_score: 95 }),
      makeArticle('High Impact', 1, { impact: 'high', impact_score: 20 }),
      makeArticle('Medium Impact', 1, { impact: 'medium', impact_score: 90 }),
    ];

    render(<NewsTab result={result} />);

    expect(screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent)).toEqual([
      'High Impact Article 1',
      'Medium Impact Article 1',
      'Low Impact Article 1',
    ]);
  });

  it('hides the top news summary and source status block', () => {
    render(<NewsTab result={makeNewsResult({ highImpactCount: 1, fullCount: 1 })} />);

    expect(screen.queryByText('News summary for GOTO.JK.')).not.toBeInTheDocument();
    expect(screen.queryByText(/NEWS SOURCES/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/LOOKBACK:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FETCHED:/i)).not.toBeInTheDocument();
    expect(screen.getByText('High Impact Article 1')).toBeInTheDocument();
  });

  it('hides low-value news card metadata', () => {
    render(<NewsTab result={makeNewsResult({ highImpactCount: 1, fullCount: 1 })} />);

    expect(screen.queryByText(/Category:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Impact Score:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Relevance:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Duplicate Removed:/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Why it matters:/i)).not.toBeInTheDocument();
  });

  it('renders all full news list items in the unified news list without display limit', () => {
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

  it('renders market context items inside the unified news list', () => {
    render(<NewsTab result={makeNewsResultWithMarketContext()} />);

    expect(screen.getByText('Asian Markets Rally on US Inflation Data')).toBeInTheDocument();
    expect(screen.getByText('Jakarta Composite Tracks Regional Risk Appetite')).toBeInTheDocument();
  });

  it('renders strict news split in compact sections', () => {
    render(<NewsTab result={makeStrictNewsResult()} />);

    const decisionSection = screen.getByText('Company News Used for Decision').closest('.rounded-md');
    const contextSection = screen.getByText('Market Context News').closest('.rounded-md');

    expect(decisionSection).toBeTruthy();
    expect(contextSection).toBeTruthy();
    expect(within(decisionSection).getByText('Bank Central Asia Reports Profit Growth')).toBeInTheDocument();
    expect(within(decisionSection).queryByText('Asian Markets Rise Before Fed Decision')).not.toBeInTheDocument();
    expect(within(contextSection).getByText('Asian Markets Rise Before Fed Decision')).toBeInTheDocument();
    expect(screen.getByText('Excluded News Debug')).toBeInTheDocument();
    expect(screen.getByText('Weak RSS Item Without Company Match')).toBeInTheDocument();
  });

  it('hides strict excluded news when debug rows are absent', () => {
    render(<NewsTab result={makeStrictNewsResult({ includeExcluded: false })} />);

    expect(screen.getByText('Company News Used for Decision')).toBeInTheDocument();
    expect(screen.getByText('Market Context News')).toBeInTheDocument();
    expect(screen.queryByText('Excluded News Debug')).not.toBeInTheDocument();
  });

  it('shows provider status when strict market context is empty', () => {
    render(<NewsTab result={makeStrictNewsResultWithEmptyMarketContext()} />);

    const contextSection = screen.getByText('Market Context News').closest('.rounded-md');

    expect(within(contextSection).getByText('No market context news was returned.')).toBeInTheDocument();
    expect(within(contextSection).getByText('rss_context: EMPTY')).toBeInTheDocument();
    expect(within(contextSection).getByText('google_news_light: EMPTY')).toBeInTheDocument();
  });

  it('links titles only when url is valid http or https', () => {
    const result = {
      ticker: 'GOTO.JK',
      related_news: {
        items: [
          { title: 'Safe Link News', url: 'https://example.com/safe' },
          { title: 'Unsafe Link News', url: 'javascript:alert(1)' },
        ],
      },
      news_impact: {
        high_impact_news: [],
      },
    };

    render(<NewsTab result={result} />);

    expect(screen.getByRole('link', { name: 'Safe Link News' })).toHaveAttribute(
      'href',
      'https://example.com/safe'
    );
    expect(screen.queryByRole('link', { name: 'Unsafe Link News' })).not.toBeInTheDocument();
    expect(screen.getByText('Unsafe Link News')).toBeInTheDocument();
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
