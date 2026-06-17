import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGeneralNews } from '../hooks/useGeneralNews';
import News from './News';

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
