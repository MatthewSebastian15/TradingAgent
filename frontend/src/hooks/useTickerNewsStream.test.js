import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useTickerNewsStream } from './useTickerNewsStream';

vi.mock('@/utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
}));

function makeStreamResponse(chunks) {
  let index = 0;
  return {
    ok: true,
    body: {
      getReader: () => ({
        read: vi.fn().mockImplementation(() => {
          if (index >= chunks.length) return Promise.resolve({ done: true });
          const value = new TextEncoder().encode(chunks[index]);
          index += 1;
          return Promise.resolve({ done: false, value });
        }),
      }),
    },
  };
}

function Harness({ onUpdate = vi.fn() }) {
  const { newCount, streamStatus, clearNewCount } = useTickerNewsStream({
    ticker: 'BBCA.JK',
    windowDays: 30,
    limit: 30,
    pollSeconds: 120,
    onUpdate,
  });

  return (
    <div>
      <span data-testid="new-count">{newCount}</span>
      <span data-testid="stream-status">{streamStatus}</span>
      <button type="button" onClick={clearNewCount}>clear</button>
    </div>
  );
}

describe('useTickerNewsStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-20T08:00:00Z'));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('handles ticker_news_updated and triggers reload callback', async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeStreamResponse([
          'event: ticker_news_stream_ready\ndata: {}\n\n',
          'event: ticker_news_updated\ndata: {"ticker":"BBCA.JK"}\n\n',
        ])
      )
    );

    render(<Harness onUpdate={onUpdate} />);

    await act(async () => {});

    expect(screen.getByTestId('new-count')).toHaveTextContent('1');
    expect(screen.getByTestId('stream-status')).toHaveTextContent('connected');
    expect(onUpdate).toHaveBeenCalledWith({ ticker: 'BBCA.JK' });
  });

  it('falls back when stream request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    render(<Harness />);

    await act(async () => {});

    expect(screen.getByTestId('stream-status')).toHaveTextContent('fallback');
  });
});
