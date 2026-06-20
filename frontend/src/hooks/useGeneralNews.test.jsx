import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearGeneralNewsClientStateForTests, useGeneralNews } from './useGeneralNews';
import { fetchGeneralNews } from '../services/generalNewsApi';

vi.mock('../services/generalNewsApi', () => ({
  fetchGeneralNews: vi.fn(),
}));

function Harness({ category = 'all', testId = 'count' }) {
  const { data, status, reload } = useGeneralNews({ category, windowDays: 7, limit: 50 });
  const articles = data?.articles || [];

  return (
    <div>
      <span data-testid={`status-${testId}`}>{status}</span>
      <span data-testid={testId}>{articles.length}</span>
      <span data-testid={`ids-${testId}`}>{articles.map((article) => article.id).join(',')}</span>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

describe('useGeneralNews', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-17T12:00:00Z'));
    clearGeneralNewsClientStateForTests();
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
  });

  afterEach(() => {
    cleanup();
    clearGeneralNewsClientStateForTests();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads immediately and does not open an SSE stream', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [{ id: '1' }] });
    vi.stubGlobal('fetch', vi.fn());

    render(<Harness />);

    await act(async () => {});

    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);
    expect(fetchGeneralNews).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'all', windowDays: 7, limit: 50 })
    );
    expect(screen.getByTestId('count')).toHaveTextContent('1');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('shares one in-flight request for duplicate hook instances', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [{ id: '1' }, { id: '2' }] });

    render(
      <>
        <Harness testId="first" />
        <Harness testId="second" />
      </>
    );

    await act(async () => {});

    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('first')).toHaveTextContent('2');
    expect(screen.getByTestId('second')).toHaveTextContent('2');
  });

  it('auto refreshes news with force refresh while visible', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(59999);
    });
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('refreshes news when the browser tab returns to visible after the minimum gap', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true })
    );
  });

  it('forces every manual refresh click to request fresh news', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    });

    expect(fetchGeneralNews).toHaveBeenCalledTimes(3);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: 'all',
        windowDays: 7,
        limit: 50,
        forceRefresh: true,
      })
    );
  });

  it('does not reuse a normal in-flight request for manual force refresh', async () => {
    let resolveInitialRequest;
    fetchGeneralNews.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveInitialRequest = resolve;
        })
    );
    fetchGeneralNews.mockResolvedValueOnce({ articles: [{ id: 'fresh' }] });

    render(<Harness />);

    fireEvent.click(screen.getByRole('button', { name: 'reload' }));

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: true })
    );

    await act(async () => {});
    expect(screen.getByTestId('ids-count')).toHaveTextContent('fresh');

    await act(async () => {
      resolveInitialRequest({ articles: [{ id: 'stale' }] });
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('fresh');
  });

  it('keeps existing news visible during silent auto refresh', async () => {
    let resolveAutoRefresh;
    fetchGeneralNews.mockResolvedValueOnce({ articles: [{ id: 'old' }] }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAutoRefresh = resolve;
        })
    );

    render(<Harness />);

    await act(async () => {});
    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      resolveAutoRefresh({ articles: [{ id: 'new' }] });
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('new');
  });
});
