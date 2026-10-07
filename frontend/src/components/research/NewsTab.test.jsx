import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NewsTab from './NewsTab';
import { useTickerNews } from '../../hooks/useTickerNews';

vi.mock('../../hooks/useTickerNews', () => ({ useTickerNews: vi.fn() }));
vi.mock('@/components/news/TickerNewsList', () => ({
  default: ({ decisionCompanyNews }) => (
    <div data-testid="ticker-news-list">{decisionCompanyNews.length} decision articles</div>
  ),
}));

const base = {
  articles: [],
  decisionCompanyNews: [],
  marketContextNews: [],
  promptArticles: [],
  providerStatus: {},
  strictNewsFilter: {},
  status: 'success',
  error: null,
  reload: vi.fn(),
};

describe('NewsTab', () => {
  afterEach(cleanup);

  it('loads news for the active ticker and renders the shared news list', () => {
    useTickerNews.mockReturnValue({
      ...base,
      decisionCompanyNews: [{ title: 'a' }, { title: 'b' }],
    });
    render(<NewsTab ticker="AAPL" />);

    expect(useTickerNews).toHaveBeenCalledWith({ ticker: 'AAPL' });
    expect(screen.getByTestId('ticker-news-list').textContent).toBe('2 decision articles');
  });

  it('shows a loading state while the first load is in flight', () => {
    useTickerNews.mockReturnValue({ ...base, status: 'loading' });
    render(<NewsTab ticker="AAPL" />);

    expect(screen.getByTestId('news-loading')).toBeTruthy();
    expect(screen.queryByTestId('ticker-news-list')).toBeNull();
  });

  it('shows the error when there is nothing cached to fall back on', () => {
    useTickerNews.mockReturnValue({ ...base, status: 'error', error: new Error('boom') });
    render(<NewsTab ticker="AAPL" />);

    expect(screen.getByText(/FAILED TO LOAD: boom/)).toBeTruthy();
  });

  it('keeps showing cached articles when a refresh failed (stale)', () => {
    useTickerNews.mockReturnValue({
      ...base,
      status: 'stale',
      error: new Error('boom'),
      decisionCompanyNews: [{ title: 'a' }],
    });
    render(<NewsTab ticker="AAPL" />);

    expect(screen.getByTestId('ticker-news-list')).toBeTruthy();
  });
});
