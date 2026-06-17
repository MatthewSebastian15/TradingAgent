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

  it('renders compact 3-line article with relative hour format', () => {
    render(
      <NewsRow
        article={{
          title: 'Bitcoin slips as traders await macro data',
          summary: 'Bloomberg Bitcoin slips as traders await macro data.',
          url: 'https://example.com/news',
          source: 'Bloomberg',
          published_at: '2026-06-15T01:00:00Z',
        }}
      />
    );

    expect(screen.getByText('Bloomberg')).toBeInTheDocument();
    expect(screen.getByText('11h')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Bitcoin slips as traders await macro data' })).toHaveAttribute(
      'href',
      'https://example.com/news'
    );
    expect(screen.getByText((_, element) => element?.textContent === ' - Bloomberg')).toBeInTheDocument();
    expect(screen.getByText('Bloomberg Bitcoin slips as traders await macro data.')).toBeInTheDocument();
    expect(screen.queryByText(/2026-06-15T01:00:00Z/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Impact/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Sentiment/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/OPEN ORIGINAL SOURCE/i)).not.toBeInTheDocument();
  });

  it('renders plain title when url is missing and hides provider names as publisher', () => {
    render(
      <NewsRow
        article={{
          title: 'Market update',
          summary: 'Market update summary.',
          source: 'rss_context',
          source_domain: 'example.com',
          published_at: '2026-06-14T01:00:00Z',
        }}
      />
    );

    expect(screen.queryByRole('link', { name: 'Market update' })).not.toBeInTheDocument();
    expect(screen.getByText('Market update')).toBeInTheDocument();
    expect(screen.getByText('1 day')).toBeInTheDocument();
    expect(screen.getByText((_, element) => element?.textContent === ' - example.com')).toBeInTheDocument();
    expect(screen.queryByText((_, element) => element?.textContent === ' - rss_context')).not.toBeInTheDocument();
  });
});
