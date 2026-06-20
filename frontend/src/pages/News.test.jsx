import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import News from './News';
import { useGeneralNews } from '../hooks/useGeneralNews';

vi.mock('../components/Navbar', () => ({
  default: () => <nav>Navbar</nav>,
}));

vi.mock('../components/TickerTape', () => ({
  default: () => <div>TickerTape</div>,
}));

vi.mock('../hooks/useGeneralNews', () => ({
  useGeneralNews: vi.fn(),
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

  it('keeps loaded news visible while refreshing news', () => {
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

  it('fetches all news once and filters categories on the client', async () => {
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

    expect(screen.queryAllByText('Stocks gain after earnings')).toHaveLength(0);
    expect(screen.getAllByText('Bitcoin rises after ETF flows').length).toBeGreaterThan(0);
    expect(useGeneralNews).not.toHaveBeenCalledWith(
      expect.objectContaining({ category: 'crypto' })
    );
  });
});
