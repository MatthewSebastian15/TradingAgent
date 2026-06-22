import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchTickerNews } from '@/services/tickerNewsApi';

import { clearTickerNewsClientStateForTests, useTickerNews } from './useTickerNews';

vi.mock('@/services/tickerNewsApi', () => ({
  fetchTickerNews: vi.fn(),
}));

function Harness({ ticker = 'BBCA.JK', testId = 'ticker-news' }) {
  const {
    decisionCompanyNews,
    marketContextNews,
    providerStatus,
    strictNewsFilter,
    status,
    error,
    reload,
  } = useTickerNews({ ticker, windowDays: 30, limit: 30 });

  return (
    <div>
      <span data-testid={`${testId}-status`}>{status}</span>
      <span data-testid={`${testId}-decision-count`}>{decisionCompanyNews.length}</span>
      <span data-testid={`${testId}-market-count`}>{marketContextNews.length}</span>
      <span data-testid={`${testId}-providers`}>{Object.keys(providerStatus).join(',')}</span>
      <span data-testid={`${testId}-used`}>
        {strictNewsFilter.decision_company_news_count ?? ''}
      </span>
      <span data-testid={`${testId}-error`}>{error?.message || ''}</span>
      <button type="button" onClick={() => reload({ force: true })}>
        force reload
      </button>
    </div>
  );
}

describe('useTickerNews', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T08:00:00Z'));
    clearTickerNewsClientStateForTests();
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    clearTickerNewsClientStateForTests();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('loads ticker news and exposes split news fields', async () => {
    fetchTickerNews.mockResolvedValue({
      decision_company_news: [{ title: 'BBCA profit' }],
      market_context_news: [{ title: 'IHSG weakens' }],
      provider_status: { google_news_light: 'success' },
      strict_news_filter: { decision_company_news_count: 1 },
    });

    render(<Harness />);

    await act(async () => {});

    expect(fetchTickerNews).toHaveBeenCalledWith(
      expect.objectContaining({
        ticker: 'BBCA.JK',
        forceRefresh: false,
        signal: expect.any(AbortSignal),
      })
    );
    expect(screen.getByTestId('ticker-news-decision-count')).toHaveTextContent('1');
    expect(screen.getByTestId('ticker-news-market-count')).toHaveTextContent('1');
    expect(screen.getByTestId('ticker-news-providers')).toHaveTextContent('google_news_light');
    expect(screen.getByTestId('ticker-news-used')).toHaveTextContent('1');
  });

  it('reload force calls endpoint with force_refresh semantics', async () => {
    fetchTickerNews.mockResolvedValueOnce({ decision_company_news: [{ title: 'old' }] });
    fetchTickerNews.mockResolvedValueOnce({ decision_company_news: [{ title: 'fresh' }] });

    render(<Harness />);
    await act(async () => {});

    fireEvent.click(screen.getByRole('button', { name: 'force reload' }));
    await act(async () => {});

    expect(fetchTickerNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('keeps cached data when refresh fails', async () => {
    fetchTickerNews
      .mockResolvedValueOnce({ decision_company_news: [{ title: 'old' }] })
      .mockRejectedValueOnce(new Error('network failed'));

    render(<Harness />);
    await act(async () => {});

    expect(screen.getByTestId('ticker-news-decision-count')).toHaveTextContent('1');

    fireEvent.click(screen.getByRole('button', { name: 'force reload' }));
    await act(async () => {});

    expect(screen.getByTestId('ticker-news-decision-count')).toHaveTextContent('1');
    expect(screen.getByTestId('ticker-news-error')).toHaveTextContent('network failed');
  });
});
