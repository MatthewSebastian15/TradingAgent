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

function selectedTicker(overrides = {}) {
  return {
    ticker: 'NVDA',
    trade_date: '2026-05-14',
    time_horizon_months: 1,
    max_debate_rounds: 3,
    analysis_depth: 'balanced',
    response_detail: 'full',
    ...overrides,
  };
}

async function selectTickerFromAutocomplete(query, result) {
  fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
    target: { value: query },
  });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(350);
  });

  const option = screen.getByRole('option', { name: new RegExp(result.symbol, 'i') });
  fireEvent.mouseDown(option);
}

describe('StockForm cleanup', () => {
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_token', 'test-owner-token');
    sessionStorage.setItem(
      '_ta_owner_token_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
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

    const { unmount } = render(<StockForm {...props} selectedResult={selectedTicker()} />);

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

    render(<StockForm {...props} selectedResult={selectedTicker()} />);

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(props.onResult).toHaveBeenCalledWith({ error: 'SSE stream ended before result.' });
    });
    expect(props.onLoading).toHaveBeenLastCalledWith(false);
  });

  it('submits only the canonical yfinance ticker selected from autocomplete', async () => {
    vi.useFakeTimers();
    const props = callbacks();
    const encoder = new TextEncoder();
    const searchResult = {
      symbol: 'UNVR.JK',
      name: 'Unilever Indonesia Tbk PT',
      exchange: 'IDX',
      type: 'EQUITY',
      price: 1780,
    };
    const fetchMock = vi.fn((url, options = {}) => {
      if (String(url).includes('/market/search')) {
        return Promise.resolve(
          new Response(JSON.stringify({ results: [searchResult] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      }

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
    await selectTickerFromAutocomplete('unvr', searchResult);
    expect(screen.getByPlaceholderText(/search ticker symbol/i).value).toBe('UNVR.JK');

    vi.useRealTimers();
    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/analysis/jobs'),
        expect.objectContaining({ method: 'POST' })
      );
    });
    const [, postOptions] = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST');
    expect(JSON.parse(postOptions.body)).toMatchObject({ ticker: 'UNVR.JK', market: 'ID' });
    await waitFor(() => {
      expect(props.onResult).toHaveBeenCalledWith(
        expect.objectContaining({ ticker: 'UNVR.JK', decision: 'Hold' })
      );
    });
  });

  it('rejects manual ticker typing when the user does not choose a search result', () => {
    const props = callbacks();
    render(<StockForm {...props} />);

    fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
      target: { value: 'NVDA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));

    expect(props.onResult).toHaveBeenCalledWith({
      error: 'Select a ticker from the search results.',
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
                encoder.encode('event: result\n' + 'data: {"ticker":"NVDA","decision":"Hold"}\n\n')
              );
              controller.close();
            },
          }),
        });
      }

      return Promise.reject(new Error(`Unexpected request: ${url}`));
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<StockForm {...props} selectedResult={selectedTicker()} />);

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

    const { unmount } = render(<StockFormMock {...props} selectedResult={selectedTicker()} />);

    fireEvent.click(screen.getByRole('button', { name: /execute analysis/i }));
    expect(props.onResult).toHaveBeenCalledWith(null);

    unmount();
    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(props.onResult).toHaveBeenCalledTimes(1);
  });

  it('renders the Bloomberg search bar and removes legacy market tabs', () => {
    const props = callbacks();
    render(<StockForm {...props} />);

    expect(screen.getByText(/agent pipeline/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/search ticker symbol/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /us/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /indonesia/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /global/i })).toBeNull();
  });
});
