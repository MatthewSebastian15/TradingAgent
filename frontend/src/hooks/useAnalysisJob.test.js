import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useAnalysisJob } from './useAnalysisJob';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => path,
  buildHeaders: vi.fn().mockResolvedValue({ 'Content-Type': 'application/json' }),
  buildAuthHeaders: vi.fn().mockResolvedValue({}),
  readHttpError: vi.fn(async (res) => res.errText || `HTTP ${res.status}`),
}));

function sseBody(text) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

function mockJobFetch(sseText, { createOk = true } = {}) {
  return vi.fn(async (url, opts = {}) => {
    if (url === '/analysis/jobs' && opts.method === 'POST') {
      return createOk
        ? { ok: true, json: async () => ({ job_id: 'job-42' }) }
        : {
            ok: false,
            status: 429,
            errText: 'Too many analyses are already running for this owner session.',
          };
    }
    if (url === '/analysis/jobs/job-42/events') {
      return { ok: true, body: sseBody(sseText) };
    }
    if (url === '/analysis/jobs/job-42' && opts.method === 'DELETE') {
      return { ok: true };
    }
    throw new Error(`Unexpected fetch: ${opts.method || 'GET'} ${url}`);
  });
}

function mountJob() {
  const callbacks = {
    onResult: vi.fn(),
    onLoading: vi.fn(),
    onStatus: vi.fn(),
    onAgentProgress: vi.fn(),
  };
  const rendered = renderHook(() => useAnalysisJob(callbacks));
  return { callbacks, ...rendered };
}

describe('useAnalysisJob', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('creates a job, streams progress, then emits the result', async () => {
    vi.stubGlobal(
      'fetch',
      mockJobFetch(
        'event: progress\ndata: {"status_message":"Running fundamentals"}\n\n' +
          'event: result\ndata: {"decision":"BUY","ticker":"AAPL"}\n\n'
      )
    );
    const { callbacks, result } = mountJob();

    await act(() => result.current.startAnalysis({ ticker: 'AAPL' }));

    expect(callbacks.onLoading).toHaveBeenNthCalledWith(1, true);
    expect(callbacks.onStatus).toHaveBeenCalledWith('Job queued: job-42');
    expect(callbacks.onStatus).toHaveBeenCalledWith('Running fundamentals');
    expect(callbacks.onAgentProgress).toHaveBeenCalledWith({
      status_message: 'Running fundamentals',
    });
    expect(callbacks.onResult).toHaveBeenLastCalledWith({
      job_id: 'job-42',
      decision: 'BUY',
      ticker: 'AAPL',
    });
    await waitFor(() => expect(result.current.running).toBe(false));
    expect(callbacks.onLoading).toHaveBeenLastCalledWith(false);
  });

  it('maps an SSE error event to an error result with request id', async () => {
    vi.stubGlobal(
      'fetch',
      mockJobFetch('event: error\ndata: {"message":"Pipeline exploded","request_id":"rid-7"}\n\n')
    );
    const { callbacks, result } = mountJob();

    await act(() => result.current.startAnalysis({ ticker: 'AAPL' }));

    expect(callbacks.onResult).toHaveBeenLastCalledWith({
      error: 'Pipeline exploded [rid-7]',
    });
  });

  it('normalizes the concurrent-job create failure into a friendly message', async () => {
    vi.stubGlobal('fetch', mockJobFetch('', { createOk: false }));
    const { callbacks, result } = mountJob();

    await act(() => result.current.startAnalysis({ ticker: 'AAPL' }));

    expect(callbacks.onResult).toHaveBeenLastCalledWith({
      error: expect.stringContaining('Analysis already running in this browser session'),
    });
  });

  it('errors when the stream ends before a result', async () => {
    vi.stubGlobal('fetch', mockJobFetch('event: heartbeat\ndata: {"status":"running"}\n\n'));
    const { callbacks, result } = mountJob();

    await act(() => result.current.startAnalysis({ ticker: 'AAPL' }));

    expect(callbacks.onStatus).toHaveBeenCalledWith('Pipeline heartbeat: RUNNING');
    expect(callbacks.onResult).toHaveBeenLastCalledWith({
      error: 'SSE stream ended before result.',
    });
  });
});
