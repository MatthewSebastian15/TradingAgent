import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
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

  it('keeps loaded news visible while manual refresh is running', () => {
    useGeneralNews.mockReturnValue({
      data: { articles },
      status: 'refreshing',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.queryByRole('status', { name: 'Loading news' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
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

    expect(useGeneralNews).toHaveBeenCalledWith({ category: 'all', windowDays: 14, limit: 50 });
    expect(screen.queryByRole('button', { name: 'INDONESIA' })).not.toBeInTheDocument();
    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bitcoin rises after ETF flows').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'CRYPTO' }));

    expect(useGeneralNews).toHaveBeenLastCalledWith({
      category: 'crypto',
      windowDays: 14,
      limit: 50,
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

  it('disables the refresh button while a manual refresh is in flight', async () => {
    const user = userEvent.setup();
    let resolveReload;
    const reload = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveReload = resolve;
        })
    );
    useGeneralNews.mockReturnValue({ data: { articles }, status: 'success', error: null, reload });

    render(<News />);

    const refreshButton = screen.getByRole('button', { name: /REFRESH/ });
    expect(refreshButton).not.toBeDisabled();

    await user.click(refreshButton);
    expect(refreshButton).toBeDisabled();

    await act(async () => {
      resolveReload();
      await Promise.resolve();
    });
    expect(refreshButton).not.toBeDisabled();
  });

  it('shows a brief update pulse when a silent refresh brings new data, not on first load', () => {
    vi.useFakeTimers();
    const mockNews = (lastUpdated) =>
      useGeneralNews.mockReturnValue({
        data: { articles, last_updated: lastUpdated },
        status: 'success',
        error: null,
        reload: vi.fn(),
      });

    mockNews('2026-06-17T12:00:00Z');
    const { rerender } = render(<News />);
    expect(screen.queryByTestId('news-live-pulse')).not.toBeInTheDocument();

    mockNews('2026-06-17T12:01:00Z');
    rerender(<News />);
    expect(screen.getByTestId('news-live-pulse')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.queryByTestId('news-live-pulse')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('shows a degraded-sources badge when some providers are failing, even with articles present', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles,
        provider_status: { rss_context: 'success', marketaux: 'error', newsdata: 'timeout' },
      },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.getByText('2/3 sources unavailable')).toBeInTheDocument();
    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
  });

  it('does not show any provider badge when every provider is healthy', () => {
    useGeneralNews.mockReturnValue({
      data: { articles, provider_status: { rss_context: 'success' } },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.queryByText(/sources unavailable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Providers OK/i)).not.toBeInTheDocument();
  });

  it('shows only the stale banner, not both stale and cooldown, when both conditions are true', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles,
        cache: { hit: true },
        refresh: { queued: false, skipped: true, reason: 'manual_refresh_cooldown' },
      },
      status: 'stale',
      error: new Error('Network failed'),
      reload: vi.fn(),
    });

    render(<News />);

    const banners = screen.getAllByText(
      /Showing cached news because the latest refresh failed|Refresh is cooling down/i
    );
    expect(banners).toHaveLength(1);
    expect(
      screen.getByText(/Showing cached news because the latest refresh failed/i)
    ).toBeInTheDocument();
  });

  it('shows only the degraded-worker banner when worker, stale, and cooldown all apply', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles,
        worker_health: { degraded: true, consecutive_failures: 3 },
        refresh: { queued: false, skipped: true, reason: 'manual_refresh_cooldown' },
      },
      status: 'stale',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(
      screen.getByText(/Background news refresh has failed 3 times in a row/i)
    ).toBeInTheDocument();
    expect(screen.queryByText(/Showing cached news because/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Refresh is cooling down/i)).not.toBeInTheDocument();
  });

  it('hides frontend status metadata that should not be shown', () => {
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

    expect(screen.getByRole('button', { name: 'FINANCE' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TECH' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CENTRAL BANK' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'REGULATORY' })).toBeInTheDocument();
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

  it('warns when the background news refresh is degraded', () => {
    useGeneralNews.mockReturnValue({
      data: { articles, worker_health: { degraded: true, consecutive_failures: 4 } },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(
      screen.getByText(/Background news refresh has failed 4 times in a row/i)
    ).toBeInTheDocument();
    expect(screen.getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
  });

  it('stays quiet while the background news refresh is healthy', () => {
    useGeneralNews.mockReturnValue({
      data: { articles, worker_health: { degraded: false, consecutive_failures: 0 } },
      status: 'success',
      error: null,
      reload: vi.fn(),
    });

    render(<News />);

    expect(screen.queryByText(/Background news refresh has failed/i)).not.toBeInTheDocument();
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
