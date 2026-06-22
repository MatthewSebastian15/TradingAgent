import '@testing-library/jest-dom/vitest';

import { act, cleanup, render, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SSE_REFRESH_THROTTLE_MS, useGeneralNewsStream } from './useGeneralNewsStream';

function Harness(props) {
  useGeneralNewsStream(props);
  return <div>stream</div>;
}

function streamResponse(chunks = [], pending = true) {
  const encoder = new TextEncoder();
  let index = 0;
  const pendingRead = new Promise(() => {});

  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: vi.fn(() => {
          if (index < chunks.length) {
            const value = encoder.encode(chunks[index]);
            index += 1;
            return Promise.resolve({ value, done: false });
          }
          return pending ? pendingRead : Promise.resolve({ value: undefined, done: true });
        }),
      }),
    },
  };
}

describe('useGeneralNewsStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens the general news stream and refreshes on general_news_updated', async () => {
    const onUpdate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(streamResponse(['event: general_news_updated\ndata: {"count":1}\n\n']))
    );

    render(<Harness enabled onUpdate={onUpdate} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/news/general/stream',
      expect.objectContaining({ credentials: 'include', method: 'GET' })
    );
  });

  it('throttles bursty SSE update events', async () => {
    const onUpdate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamResponse([
            Array.from({ length: 5 }, () => 'event: general_news_updated\ndata: {}\n\n').join(''),
          ])
        )
    );

    render(<Harness enabled onUpdate={onUpdate} />);

    await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(SSE_REFRESH_THROTTLE_MS);
    });

    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('reconnects after stream failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, status: 503, body: null })
        .mockResolvedValueOnce(streamResponse([], true))
    );

    render(<Harness enabled onUpdate={vi.fn()} />);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts the stream on cleanup', async () => {
    let signal;
    vi.stubGlobal(
      'fetch',
      vi.fn((_, options) => {
        signal = options.signal;
        return Promise.resolve(streamResponse([], true));
      })
    );

    const { unmount } = render(<Harness enabled onUpdate={vi.fn()} />);

    await waitFor(() => expect(signal).toBeTruthy());
    unmount();

    expect(signal.aborted).toBe(true);
  });
});
