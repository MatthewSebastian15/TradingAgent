import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_token', 'test-owner-token');
    sessionStorage.setItem('_ta_owner_token_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
  });

  afterEach(() => {
    cleanup();
    sessionStorage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('cancels the backend job when unmounted during a live run', async () => {
    const props = callbacks();
    let streamAborted = false;
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
            streamAborted = true;
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
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'text/event-stream',
            'Cache-Control': 'no-cache',
          }),
        })
      );
    });

    unmount();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs/job-123'),
        expect.objectContaining({ method: 'DELETE', keepalive: true })
      );
    });
    expect(streamAborted).toBe(true);
    expect(props.onResult).not.toHaveBeenCalledWith({ error: 'Analysis cancelled.' });
  });

  it('surfaces an error when the SSE stream ends before a result or error event', async () => {
    const props = callbacks();
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job_id: 'job-closed-early', status: 'queued' }),
        });
      }

      if (options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: progress\n' +
                    'data: {"status_message":"Mock progress","agent_id":"market"}\n\n'
                )
              );
              controller.close();
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StockForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(props.onResult).toHaveBeenCalledWith({ error: 'SSE stream ended before result.' });
    });
    expect(props.onLoading).toHaveBeenLastCalledWith(false);
  });

  it('submits Indonesian tickers as plain codes with market context', async () => {
    const props = callbacks();
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job_id: 'job-idx', status: 'queued' }),
        });
      }

      if (options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: result\n' + 'data: {"ticker":"UNVR.JK","decision":"Hold"}\n\n'
                )
              );
              controller.close();
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StockForm {...props} />);

    fireEvent.click(screen.getByRole('button', { name: /indonesia/i }));
    expect(screen.queryByRole('button', { name: 'BBCA.JK' })).toBeNull();

    const tickerInput = screen.getByRole('textbox');
    fireEvent.change(tickerInput, { target: { value: 'UNVR.JK' } });
    expect(tickerInput.value).toBe('UNVR');

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs'),
        expect.objectContaining({ method: 'POST' })
      );
    });
    const [, postOptions] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(postOptions.body)).toMatchObject({ ticker: 'UNVR', market: 'ID' });
    await waitFor(() => {
      expect(props.onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'UNVR.JK', decision: 'Hold' })
      );
    });
  });


  it('sends existing-position context when user checks the position box', async () => {
    const props = callbacks();
    const encoder = new TextEncoder();
    const fetchMock = vi.fn((url, options = {}) => {
      if (options.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ job_id: 'job-position', status: 'queued' }),
        });
      }

      if (options.method === 'GET') {
        return Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: result\n' + 'data: {"ticker":"NVDA","decision":"Hold"}\n\n'
                )
              );
              controller.close();
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StockForm {...props} />);

    fireEvent.click(screen.getByLabelText(/existing position/i));
    fireEvent.change(screen.getByLabelText(/position qty/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/avg entry/i), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs'),
        expect.objectContaining({ method: 'POST' })
      );
    });
    const [, postOptions] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(postOptions.body)).toMatchObject({
      has_existing_position: true,
      position_quantity: 10,
      average_entry_price: 900,
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

  it('only shows US and Indonesia market tabs', () => {
    const props = callbacks();
    render(<StockForm {...props} />);

    expect(screen.getByRole('button', { name: /us/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /indonesia/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /global/i })).toBeNull();
  });
});
