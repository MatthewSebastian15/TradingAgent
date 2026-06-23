import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sortNewsItemsByNewest } from '@/lib/news/sortNewsItemsByNewest';

import HomeNewsSummary from './HomeNewsSummary';

const news = [
  {
    id: 'older',
    title: 'Older market story',
    description: 'Older market description.',
    source: 'CNBC',
    category: 'markets',
    published_at: '2026-06-19T08:00:00Z',
  },
  {
    id: 'newest',
    title: 'US stocks rise as tech shares lead gains',
    description: 'Major indexes moved higher after earnings guidance.',
    source: 'Bloomberg',
    category: 'markets',
    published_at: '2026-06-19T11:48:00Z',
    url: 'https://example.com/stocks',
  },
  {
    id: 'second',
    title: 'Oil prices steady as investors watch supply',
    summary: 'Traders monitor demand outlook and policy updates.',
    source: { name: 'Reuters' },
    topic: 'world',
    publishedAt: '2026-06-19T11:32:00Z',
  },
  {
    id: 'third',
    headline: 'Chip stocks gain after AI demand update',
    snippet: 'Semiconductor names climbed in early trade.',
    source: 'CNBC',
    section: 'tech',
    pubDate: '2026-06-19T11:00:00Z',
  },
];

describe('HomeNewsSummary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T12:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the title and compact top-three news from the same final order as News', () => {
    render(<HomeNewsSummary news={news} />);

    expect(screen.getByRole('heading', { name: 'News' })).toBeInTheDocument();
    expect(screen.getByText('Top 3 Latest')).toBeInTheDocument();

    const headlines = screen.getAllByRole('heading', { level: 3 }).map((node) => node.textContent);
    const expectedHeadlines = sortNewsItemsByNewest(news)
      .slice(0, 3)
      .map((item) => item.headline || item.title || item.name);

    expect(headlines).toEqual(expectedHeadlines);
    expect(screen.queryByText('Older market story')).not.toBeInTheDocument();
  });

  it('renders metadata, headline, description, and one-line clamp classes', () => {
    render(<HomeNewsSummary news={news} />);

    const metadata = screen.getByText('MARKETS - Bloomberg - 12m');
    const headline = screen.getByText('US stocks rise as tech shares lead gains');
    const description = screen.getByText('Major indexes moved higher after earnings guidance.');

    expect(metadata).toHaveClass('truncate', 'text-[9px]');
    expect(headline).toHaveClass('line-clamp-1', 'text-[13px]');
    expect(description).toHaveClass('line-clamp-1', 'text-[11px]');
    expect(screen.getByText('WORLD - Reuters - 28m')).toBeInTheDocument();
  });

  it('collapses to a single bar when the header is clicked', () => {
    render(<HomeNewsSummary news={news} />);

    expect(screen.getByText('US stocks rise as tech shares lead gains')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { expanded: true }));
    expect(
      screen.queryByText('US stocks rise as tech shares lead gains')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();
  });

  it('renders an empty state when news is empty', () => {
    render(<HomeNewsSummary news={[]} />);

    expect(screen.getByText('No news available yet.')).toBeInTheDocument();
  });

  it('renders a compact loading skeleton while loading', () => {
    const { container } = render(<HomeNewsSummary loading news={[]} />);

    expect(screen.getByLabelText('Loading summary news')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(9);
  });

  it('renders a compact error state when loading fails', () => {
    render(<HomeNewsSummary error="Request failed" news={news} />);

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load summary news.');
  });

  it('renders a new-tab link when a news URL is available', () => {
    render(<HomeNewsSummary news={news} />);

    const link = screen.getByRole('link', { name: /US stocks rise as tech shares lead gains/i });

    expect(link).toHaveAttribute('href', 'https://example.com/stocks');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });
});
