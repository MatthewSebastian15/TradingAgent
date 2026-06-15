import '@testing-library/jest-dom/vitest';

import React from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchGeneralNews } from '../services/generalNewsApi';
import { useGeneralNews } from './useGeneralNews';

vi.mock('../services/generalNewsApi', () => ({
  fetchGeneralNews: vi.fn(),
}));

function streamResponse(text) {
  return Promise.resolve({
    ok: true,
    body: {
      getReader() {
        let done = false;
        return {
          read: vi.fn(async () => {
            if (done) return { done: true };
            done = true;
            return { done: false, value: new TextEncoder().encode(text) };
          }),
        };
      },
    },
  });
}

function Harness({ category = 'all' }) {
  const { data, status, reload } = useGeneralNews({ category, windowDays: 7, limit: 50 });

  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="count">{data?.articles?.length || 0}</span>
      <button type="button" onClick={reload}>
        reload
      </button>
    </div>
  );
}

describe('useGeneralNews', () => {
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_session_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('loads general news and opens SSE stream', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [{ id: '1' }] });
    vi.stubGlobal('fetch', vi.fn(() => streamResponse('')));

    render(<Harness />);

    await waitFor(() => expect(fetchGeneralNews).toHaveBeenCalledWith(expect.objectContaining({ category: 'all' })));
    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('1'));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/news/general/stream',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('SSE update triggers refetch', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        streamResponse('event: general_news_updated\ndata: {"last_updated":"2026-06-14T10:32:00Z","new_count":1}\n\n')
      )
    );

    render(<Harness />);

    await waitFor(() => expect(fetchGeneralNews).toHaveBeenCalledTimes(2));
  });

  it('polling fallback works if SSE fails', async () => {
    const intervals = [];
    vi.spyOn(window, 'setInterval').mockImplementation((callback, delay) => {
      intervals.push({ callback, delay });
      return 1;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {});
    fetchGeneralNews.mockResolvedValue({ articles: [] });
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, body: null })));

    render(<Harness />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(fetchGeneralNews).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(intervals.some((interval) => interval.delay === 60000)).toBe(true));

    act(() => {
      intervals.find((interval) => interval.delay === 60000).callback();
    });

    await waitFor(() => expect(fetchGeneralNews).toHaveBeenCalledTimes(2));
  });
});
