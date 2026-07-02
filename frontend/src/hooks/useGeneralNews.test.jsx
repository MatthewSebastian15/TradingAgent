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
  const { data, status, reload, error } = useGeneralNews({ category, windowDays: 7, limit: 50 });
  const articles = data?.articles || [];

  return (
    <div>
      <span data-testid={`status-${testId}`}>{status}</span>
      <span data-testid={testId}>{articles.length}</span>
      <span data-testid={`ids-${testId}`}>{articles.map((article) => article.id).join(',')}</span>
      <span data-testid={`error-${testId}`}>{error?.message || ''}</span>
      <span data-testid={`message-${testId}`}>{data?.message || ''}</span>
      <button type="button" onClick={reload}>
        reload
      </button>
      <button type="button" onClick={() => reload({ force: true, silent: true })}>
        silent reload
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
      expect.objectContaining({
        category: 'all',
        windowDays: 7,
        limit: 50,
        forceRefresh: false,
      })
    );
    expect(fetchGeneralNews).toHaveBeenCalledWith(
      expect.objectContaining({ signal: expect.any(AbortSignal) })
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

  it('auto refreshes news once the cache TTL expires, without force refresh', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    // 60s interval tick is served from the 120s response cache — no network call.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    // The 120s tick finds the cache expired and refetches.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000);
    });

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: false })
    );
  });

  it('refreshes news when the tab returns to visible with an expired cache', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    });
    try {
      // Hidden tab: interval ticks at 60s/120s are skipped, cache goes stale.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(130000);
      });
      expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'visible',
      });
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } finally {
      delete document.visibilityState;
    }

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({ forceRefresh: false })
    );
  });

  it('manual refresh uses force once and falls back to cached reload during cooldown', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    });
    expect(screen.getByTestId('status-count')).toHaveTextContent('refreshing');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    });

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
    expect(fetchGeneralNews).toHaveBeenLastCalledWith(
      expect.objectContaining({
        category: 'all',
        windowDays: 7,
        limit: 50,
        forceRefresh: true,
      })
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });

    expect(screen.getByTestId('message-count')).toHaveTextContent(
      'Refresh is cooling down. Showing latest cached news.'
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

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
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

    // The 120s tick starts a real refetch (60s tick is cache-served).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(120000);
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      resolveAutoRefresh({ articles: [{ id: 'new' }] });
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('new');
  });

  it('falls back to cached news silently when a forced refresh fails', async () => {
    fetchGeneralNews
      .mockResolvedValueOnce({ articles: [{ id: 'old' }] })
      .mockRejectedValueOnce(new Error('network failed'));

    render(<Harness />);

    await act(async () => {});
    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'reload' }));
      await vi.advanceTimersByTimeAsync(700);
    });

    // Fresh cache absorbs the failure: old data stays, no user-facing error.
    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');
    expect(screen.getByTestId('status-count')).toHaveTextContent('success');
    expect(screen.getByTestId('error-count')).toHaveTextContent('');
  });

  it('keeps loaded data visible during silent reload option', async () => {
    let resolveSilentRefresh;
    fetchGeneralNews.mockResolvedValueOnce({ articles: [{ id: 'old' }] }).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveSilentRefresh = resolve;
        })
    );

    render(<Harness />);

    await act(async () => {});
    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'silent reload' }));
    });

    expect(screen.getByTestId('status-count')).toHaveTextContent('success');
    expect(screen.getByTestId('ids-count')).toHaveTextContent('old');

    await act(async () => {
      resolveSilentRefresh({ articles: [{ id: 'new' }] });
    });

    expect(screen.getByTestId('ids-count')).toHaveTextContent('new');
  });
});
