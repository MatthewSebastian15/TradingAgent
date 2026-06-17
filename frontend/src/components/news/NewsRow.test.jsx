import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
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

    expect(screen.getByText('Bloomberg')).toBeInTheDocument();
    expect(screen.getByText('CRYPTO')).toBeInTheDocument();
    expect(screen.getByText('11h')).toBeInTheDocument();
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
    expect(screen.getByText('1 Day')).toBeInTheDocument();
    expect(screen.getByText('MARKET')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
    expect(screen.queryByText('rss_context')).not.toBeInTheDocument();
  });

  it('renders weeks after seven days', () => {
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

    expect(screen.getByText('2 W')).toBeInTheDocument();
  });
});
