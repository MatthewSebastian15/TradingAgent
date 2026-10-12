import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./useAnalysisHistoryStore', () => ({
  historyResourceId: (item) => item.request_id || null,
  normalizeBackendHistory: (items) => items,
  readHistory: vi.fn(),
  writeHistory: vi.fn(async () => {}),
}));
vi.mock('../utils/analysisHistoryApi', () => ({ fetchAnalysisHistory: vi.fn() }));

import { readHistory, writeHistory } from './useAnalysisHistoryStore';
import { useSignalsFeed } from './useSignalsFeed';
import { fetchAnalysisHistory } from '../utils/analysisHistoryApi';

const entry = (id, ticker, createdAt) => ({
  request_id: id,
  ticker,
  decision: 'BUY',
  analysis_created_at: createdAt,
});
const ids = (result) => result.current.signals.map((signal) => signal.id);

beforeEach(() => {
  vi.clearAllMocks();
  readHistory.mockResolvedValue([]);
  fetchAnalysisHistory.mockResolvedValue([]);
});

describe('useSignalsFeed', () => {
  it('paints the saved list immediately, then replaces it with the network result', async () => {
    readHistory.mockResolvedValue([entry('old', 'AAPL', '2026-05-01T00:00:00Z')]);
    let resolveNetwork;
    fetchAnalysisHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveNetwork = resolve;
        })
    );

    const { result } = renderHook(() => useSignalsFeed({ pageSize: 2 }));

    await waitFor(() => expect(ids(result)).toEqual(['old']));
    expect(result.current.fromMirror).toBe(true);
    expect(result.current.loading).toBe(false);

    await act(async () => {
      resolveNetwork([
        entry('new', 'NVDA', '2026-06-01T00:00:00Z'),
        entry('old', 'AAPL', '2026-05-01T00:00:00Z'),
      ]);
    });
    await waitFor(() => expect(result.current.fromMirror).toBe(false));
    expect(ids(result)).toEqual(['new', 'old']);
    expect(writeHistory).toHaveBeenCalledWith('ta_analysis_history', expect.any(Array));
  });

  it('requests the network and the mirror in parallel (network is not gated on decrypt)', async () => {
    let releaseMirror;
    readHistory.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseMirror = resolve;
        })
    );

    renderHook(() => useSignalsFeed());

    await waitFor(() => expect(fetchAnalysisHistory).toHaveBeenCalledTimes(1));
    releaseMirror([]);
  });

  it('pages with offset, de-duplicates shifted rows and stops when a page adds nothing', async () => {
    const e = (n) => entry(`r${n}`, 'AAPL', `2026-05-0${n}T00:00:00Z`);
    fetchAnalysisHistory
      .mockResolvedValueOnce([e(5), e(4)]) // first page
      .mockResolvedValueOnce([e(4), e(3)]) // r4 shifted onto page 2
      .mockResolvedValueOnce([e(4), e(3)]); // a server that ignores offset

    const { result } = renderHook(() => useSignalsFeed({ pageSize: 2 }));
    await waitFor(() => expect(ids(result)).toEqual(['r5', 'r4']));
    expect(result.current.hasMore).toBe(true);

    await act(() => result.current.loadMore());
    expect(fetchAnalysisHistory.mock.calls[1][0]).toMatchObject({ limit: 2, offset: 2 });
    expect(ids(result)).toEqual(['r5', 'r4', 'r3']);
    expect(result.current.hasMore).toBe(true);

    await act(() => result.current.loadMore());
    expect(fetchAnalysisHistory.mock.calls[2][0]).toMatchObject({ offset: 4 });
    expect(ids(result)).toEqual(['r5', 'r4', 'r3']); // nothing new
    expect(result.current.hasMore).toBe(false);
  });

  it('has no more pages when the first page is short', async () => {
    fetchAnalysisHistory.mockResolvedValue([entry('r1', 'AAPL', '2026-05-01T00:00:00Z')]);
    const { result } = renderHook(() => useSignalsFeed({ pageSize: 25 }));
    await waitFor(() => expect(ids(result)).toEqual(['r1']));
    expect(result.current.hasMore).toBe(false);
  });

  it('keeps the painted list and reports a soft error when the refresh fails', async () => {
    readHistory.mockResolvedValue([entry('saved', 'AAPL', '2026-05-01T00:00:00Z')]);
    fetchAnalysisHistory.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSignalsFeed());

    await waitFor(() => expect(result.current.error).toMatch(/Showing the saved list/));
    expect(ids(result)).toEqual(['saved']);
    expect(result.current.loading).toBe(false);
  });

  it('shows the real error when there is nothing saved to fall back on', async () => {
    fetchAnalysisHistory.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useSignalsFeed());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.signals).toEqual([]);
  });

  it('looks up older analyses of one ticker via the server filter and merges them', async () => {
    fetchAnalysisHistory.mockResolvedValueOnce([entry('r9', 'AAPL', '2026-06-01T00:00:00Z')]);
    const { result } = renderHook(() => useSignalsFeed({ pageSize: 25 }));
    await waitFor(() => expect(ids(result)).toEqual(['r9']));

    fetchAnalysisHistory.mockResolvedValueOnce([entry('r1', 'NVDA', '2026-01-01T00:00:00Z')]);
    let outcome;
    await act(async () => {
      outcome = await result.current.lookupTicker(' nvda ');
    });

    expect(fetchAnalysisHistory.mock.calls[1][0]).toMatchObject({ ticker: 'NVDA', limit: 25 });
    expect(outcome).toEqual({ found: 1 });
    expect(ids(result)).toEqual(['r9', 'r1']);
  });

  it('aborts the in-flight request on unmount', async () => {
    fetchAnalysisHistory.mockImplementation(() => new Promise(() => {}));
    const { unmount } = renderHook(() => useSignalsFeed());
    await waitFor(() => expect(fetchAnalysisHistory).toHaveBeenCalled());

    const { signal } = fetchAnalysisHistory.mock.calls[0][0];
    unmount();

    expect(signal.aborted).toBe(true);
  });

  it('keeps exactly one live first-page request under StrictMode (the extra one is aborted)', async () => {
    fetchAnalysisHistory.mockImplementation(() => new Promise(() => {}));

    renderHook(() => useSignalsFeed(), { wrapper: React.StrictMode });
    await waitFor(() => expect(fetchAnalysisHistory).toHaveBeenCalled());

    const signals = fetchAnalysisHistory.mock.calls.map(([options]) => options.signal);
    const live = signals.filter((signal) => !signal.aborted);
    expect(live).toHaveLength(1);
  });
});
