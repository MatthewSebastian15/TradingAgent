import '@testing-library/jest-dom/vitest';

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchGeneralNews } from '../services/generalNewsApi';
import { clearGeneralNewsClientStateForTests, useGeneralNews } from './useGeneralNews';

vi.mock('../services/generalNewsApi', () => ({
  fetchGeneralNews: vi.fn(),
}));

function Harness({ category = 'all', testId = 'count' }) {
  const { data, status, reload } = useGeneralNews({ category, windowDays: 7, limit: 50 });

  return (
    <div>
      <span data-testid={`status-${testId}`}>{status}</span>
      <span data-testid={testId}>{data?.articles?.length || 0}</span>
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

  it('polls at a low frequency without stream fallback spam', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});

    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(119999);
    });
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
  });

  it('throttles repeated manual refresh clicks', async () => {
    fetchGeneralNews.mockResolvedValue({ articles: [] });

    render(<Harness />);

    await act(async () => {});
    expect(fetchGeneralNews).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'reload' }));
    fireEvent.click(screen.getByRole('button', { name: 'reload' }));

    expect(fetchGeneralNews).toHaveBeenCalledTimes(2);
  });
});
