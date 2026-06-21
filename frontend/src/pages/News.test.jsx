import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import News from './News';
import { useGeneralNews } from '../hooks/useGeneralNews';
import { useGeneralNewsStream } from '../hooks/useGeneralNewsStream';

vi.mock('../components/Navbar', () => ({
  default: () => <nav>Navbar</nav>,
}));

vi.mock('../components/TickerTape', () => ({
  default: () => <div>TickerTape</div>,
}));

vi.mock('../hooks/useGeneralNews', () => ({
  useGeneralNews: vi.fn(),
  loadGeneralNews: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../hooks/useGeneralNewsStream', () => ({
  useGeneralNewsStream: vi.fn(),
}));

const articles = [
  {
    id: '1',
    title: 'Stocks gain after earnings',
    source: 'CNBC',
    category: 'market',
    published_at: '2026-06-17T00:00:00Z',
  },
  {
    id: '2',
    title: 'Bitcoin rises after ETF flows',
    source: 'CoinDesk',
    category: 'crypto',
    published_at: '2026-06-17T00:00:00Z',
  },
];

describe('News page', () => {
  beforeEach(() => {
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders compact skeleton while loading news', () => {
    useGeneralNews.mockReturnValue({
      data: null,
      status: 'loading',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.getByRole('status', { name: 'Loading news' })).toBeInTheDocument();
    expect(screen.queryByText('Loading news...')).not.toBeInTheDocument();
    expect(screen.queryByText('No news found for this category.')).not.toBeInTheDocument();
  });

  it('replaces loaded news with skeleton while manual refresh is running', () => {
    useGeneralNews.mockReturnValue({
      data: { articles },
      status: 'refreshing',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.getByRole('status', { name: 'Loading news' })).toBeInTheDocument();
    expect(screen.queryByText('Stocks gain after earnings')).not.toBeInTheDocument();
  });

  it('passes the active category to useGeneralNews instead of relying on client filtering', async () => {
    const user = userEvent.setup();
    useGeneralNews.mockReturnValue({
      data: { articles },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(useGeneralNews).toHaveBeenCalledWith({ category: 'all', windowDays: 7, limit: 100 });
    expect(screen.queryByRole('button', { name: 'INDONESIA' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bitcoin rises after ETF flows').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'CRYPTO' }));

    expect(useGeneralNews).toHaveBeenLastCalledWith({
      category: 'crypto',
      windowDays: 7,
      limit: 100,
    });
  });

  it('connects the general news SSE stream and reloads cache without force on updates', () => {
    const reload = vi.fn();
    useGeneralNews.mockReturnValue({
      data: { articles },
      status: 'success',
      error: null,
      reload,
    });

    render(<News />);

    expect(useGeneralNewsStream).toHaveBeenCalledWith({
      enabled: true,
      onUpdate: expect.any(Function),
    });

    useGeneralNewsStream.mock.calls[0][0].onUpdate();
    expect(reload).toHaveBeenCalledWith({ force: false, silent: true });
  });

  it('hides category buttons and frontend status metadata that should not be shown', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles,
        last_updated: '2026-06-17T12:00:00Z',
        cache: { hit: false },
        provider_status: { rss_context: 'success' },
      },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.queryByRole('button', { name: 'FINANCE' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'TECH' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'CENTRAL BANK' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'REGULATORY' })).not.toBeInTheDocument();
    expect(screen.queryByText(/stories/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Updated/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cache fresh/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Providers OK/i)).not.toBeInTheDocument();
  });

  it('renders refresh metadata and manual cooldown notice', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles,
        refresh: { queued: false, skipped: true, reason: 'manual_refresh_cooldown' },
      },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.queryByText(/Refresh cooldown/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(/Refresh is cooling down. Showing latest cached news/i)
    ).toBeInTheDocument();
  });

  it('keeps stale news visible when refresh fails', () => {
    useGeneralNews.mockReturnValue({
      data: { articles, cache: { hit: true } },
      status: 'stale',
      error: new Error('Network failed'),
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Showing cached news because the latest refresh failed/i)
    ).toBeInTheDocument();
  });
});
