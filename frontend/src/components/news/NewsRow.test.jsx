import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NewsRow from './NewsRow';

describe('NewsRow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the source, category, relative age, headline, and 35-word capped description', () => {
    render(
      <NewsRow
        article={{
          title: 'Bitcoin slips as traders await macro data',
          summary:
            'Bitcoin slipped as traders waited for macro data, policy signals, liquidity updates, ETF flows, bond market moves, dollar strength, derivatives positioning, and broader risk appetite across global markets before adding exposure again today while desks reviewed overnight liquidity conditions and volatility risk.',
          url: 'https://example.com/news',
          source: 'Bloomberg',
          category: 'crypto',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );

    expect(screen.getByText('BLOOMBERG')).toBeInTheDocument();
    expect(screen.getByText('CRYPTO')).toBeInTheDocument();
    expect(screen.getByText('11h')).toBeInTheDocument();
    const metaEl = screen.getByText('CRYPTO').closest('.terminal-news-meta');
    expect(metaEl).toHaveTextContent('11h');
    expect(metaEl).toHaveTextContent('BLOOMBERG');
    expect(metaEl).toHaveTextContent('CRYPTO');
    expect(
      screen.getByRole('link', { name: 'Bitcoin slips as traders await macro data' })
    ).toHaveAttribute('href', 'https://example.com/news');
    expect(
      screen.getByText(/Bitcoin slipped as traders waited/).textContent.split(/\s+/)
    ).toHaveLength(35);
    expect(screen.queryByText(/2026-06-15T01:00:00Z/)).not.toBeInTheDocument();
    expect(screen.queryByText(/2026-06-15/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Impact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sentiment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/OPEN ORIGINAL SOURCE/i)).not.toBeInTheDocument();
  });

  it('renders plain title when url is missing and avoids provider names as data source', () => {
    render(
      <NewsRow
        article={{
          title: 'Market update',
          summary: 'Market update summary.',
          source: 'rss_context',
          source_domain: 'example.com',
          category: 'market',
          published_at: '2026-06-14T01:00:00Z',
        }}
      />
    );

    expect(screen.queryByRole('link', { name: 'Market update' })).not.toBeInTheDocument();
    expect(screen.getByText('Market update')).toBeInTheDocument();
    expect(screen.getByText('1d')).toBeInTheDocument();
    expect(screen.getByText('MARKETS')).toBeInTheDocument();
    expect(screen.getByText('EXAMPLE.COM')).toBeInTheDocument();
    expect(screen.queryByText('RSS_CONTEXT')).not.toBeInTheDocument();
  });

  it('renders compact weeks after seven days', () => {
    render(
      <NewsRow
        article={{
          title: 'Older market update',
          summary: 'Older market update summary.',
          source: 'CNBC',
          category: 'market',
          published_at: '2026-06-01T12:00:00Z',
        }}
      />
    );

    expect(screen.getByText('2w')).toBeInTheDocument();
  });
});

describe('NewsRow final category labels', () => {
  afterEach(() => cleanup());

  it('renders central_bank as CENTRAL BANK', () => {
    render(
      <NewsRow
        article={{
          title: 'Fed rate decision update',
          summary: 'Central bank policy update.',
          source: 'Federal Reserve',
          category: 'central_bank',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );

    expect(screen.getByText('CENTRAL BANK')).toBeInTheDocument();
  });

  it('keeps legacy market category styled as markets', () => {
    render(
      <NewsRow
        article={{
          title: 'Legacy market payload',
          summary: 'Legacy category payload.',
          source: 'CNBC',
          category: 'market',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );

    expect(screen.getByText('MARKETS')).toBeInTheDocument();
  });
});

describe('NewsRow category badge colors', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders crypto badge with cyan color', () => {
    render(
      <NewsRow
        article={{
          title: 'Bitcoin update',
          source: 'CoinDesk',
          category: 'crypto',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );
    const badge = screen.getByText('CRYPTO');
    expect(badge.style.color).toBe('rgb(6, 182, 212)');
  });

  it('renders regulatory badge with red color', () => {
    render(
      <NewsRow
        article={{
          title: 'SEC update',
          source: 'Reuters',
          category: 'regulatory',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );
    const badge = screen.getByText('REGULATORY');
    expect(badge.style.color).toBe('rgb(239, 68, 68)');
  });

  it('renders unknown category badge with muted fallback color', () => {
    render(
      <NewsRow
        article={{
          title: 'Misc update',
          source: 'Reuters',
          category: 'unknown_xyz',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );
    const badge = screen.getByText('UNKNOWN');
    expect(badge.style.color).toBe('rgb(82, 82, 82)');
  });
});
