import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import StockForm from './StockForm';
import StockFormMock from './StockFormMock';

function callbacks() {
  return {
    onResult: vi.fn(),
    onLoading: vi.fn(),
    onStatus: vi.fn(),
    onAgentProgress: vi.fn(),
  };
}

describe('StockForm cleanup', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cancels the backend job when unmounted during a live run', async () => {
    const props = callbacks();
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job_id: 'job-123', status: 'queued' }),
        });
      }

      if (options.method === 'GET') {
        return new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            const error = new Error('Aborted');
            error.name = 'AbortError';
            reject(error);
          });
        });
      }

      if (options.method === 'DELETE') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job_id: 'job-123', status: 'cancelled' }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    const { unmount } = render(<StockForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs/job-123/events'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    unmount();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs/job-123'),
        expect.objectContaining({ method: 'DELETE', keepalive: true })
      );
    });
  });

  it('clears mock pipeline timers when unmounted', () => {
    vi.useFakeTimers();
    const props = callbacks();

    const { unmount } = render(<StockFormMock {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));
    expect(props.onResult).toHaveBeenCalledWith(null);

    unmount();
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(props.onResult).toHaveBeenCalledTimes(1);
  });
});
