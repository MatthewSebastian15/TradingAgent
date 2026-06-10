import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AnalysisWorkspace from './AnalysisWorkspace';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderWorkspace(
  FormComponent,
  historyKey = 'analysis-history-test',
  initialEntry = '/analysis',
  workspaceProps = {}
) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/analysis"
          element={
            <AnalysisWorkspace
              FormComponent={FormComponent}
              historyKey={historyKey}
              emptyDescription="Empty"
              backendHistoryEnabled={false}
              {...workspaceProps}
            />
          }
        />
        <Route
          path="/analysis/:resourceId"
          element={
            <AnalysisWorkspace
              FormComponent={FormComponent}
              historyKey={historyKey}
              emptyDescription="Empty"
              backendHistoryEnabled={false}
              {...workspaceProps}
            />
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

function openConfigPanel() {
  fireEvent.click(screen.getByTitle('Configuration'));
}

function openHistoryPanel() {
  fireEvent.click(screen.getByTitle('History'));
}

function historySummary(overrides = {}) {
  return {
    schema_version: 2,
    job_id: null,
    request_id: null,
    ticker: null,
    market: null,
    trade_date: null,
    status: 'completed',
    decision: null,
    display_signal:
      overrides.display_signal ?? overrides.final_decision ?? overrides.decision ?? null,
    confidence_score: overrides.confidence_score ?? null,
    confidence_tier: overrides.confidence_tier ?? null,
    time_horizon_months: null,
    analysis_created_at: null,
    saved_at: expect.any(String),
    ...overrides,
  };
}

function completedJobResponse({
  jobId = 'job-1',
  requestId = 'request-backend',
  ticker = 'MSFT',
  result = {},
} = {}) {
  return new Response(
    JSON.stringify({
      job_id: jobId,
      request_id: requestId,
      status: 'completed',
      result: {
        request_id: requestId,
        ticker,
        market: 'US',
        trade_date: '2026-05-14',
        decision: 'Buy',
        time_horizon_months: 1,
        ...result,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
}

function notFoundResponse() {
  return new Response(
    JSON.stringify({
      error: {
        code: 'NOT_FOUND',
        message: 'Analysis result was not found.',
      },
    }),
    { status: 404, headers: { 'Content-Type': 'application/json' } }
  );
}

describe('AnalysisWorkspace history storage', () => {
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_token', 'test-owner-token');
    sessionStorage.setItem(
      '_ta_owner_token_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders the config icon button and opens the config panel on click', () => {
    function StubForm() {
      return <div>FORM CONTENT</div>;
    }

    renderWorkspace(StubForm);

    expect(screen.getByTitle('Configuration')).toBeTruthy();
    openConfigPanel();

    expect(screen.getByText(/configuration/i)).toBeTruthy();
    expect(screen.getByText('FORM CONTENT')).toBeTruthy();
  });

  it('renders the history icon button and opens the history panel on click', () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'request-history',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-14',
          decision: 'Buy',
          saved_at: new Date().toISOString(),
        },
      ])
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);

    expect(screen.getByTitle('History')).toBeTruthy();
    openHistoryPanel();

    expect(screen.getByText(/history/i)).toBeTruthy();
  });

  it('closes the active panel when the same icon is clicked again', () => {
    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openConfigPanel();
    expect(screen.getByText(/configuration/i)).toBeTruthy();

    openConfigPanel();

    expect(screen.queryByText(/configuration/i)).toBeNull();
  });

  it('switches from config panel to history panel when history icon is clicked while config is open', () => {
    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openConfigPanel();
    expect(screen.getByText(/configuration/i)).toBeTruthy();

    openHistoryPanel();

    expect(screen.getByText(/history/i)).toBeTruthy();
    expect(screen.queryByText(/configuration/i)).toBeNull();
  });

  it('closes the active panel when backdrop is clicked', () => {
    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openConfigPanel();
    expect(screen.getByText(/configuration/i)).toBeTruthy();

    const backdrop = document.querySelector('div.fixed.inset-0');
    fireEvent.click(backdrop);

    expect(screen.queryByText(/configuration/i)).toBeNull();
  });

  it('stores only version 2 summary fields for debug responses', () => {
    function DebugForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
              job_id: 'job-debug',
              request_id: 'debug-request',
              ticker: 'AAPL',
              market: 'US',
              trade_date: '2026-05-14',
              status: 'completed',
              decision: 'Buy',
              time_horizon_months: 2,
              position_quantity: 10,
              average_entry_price: 150,
              response_detail: 'debug',
              executive_summary: 'Summary',
              raw_agent_state: { internal: true },
            })
          }
        >
          Emit debug
        </button>
      );
    }

    renderWorkspace(DebugForm, 'analysis-history-test', '/analysis', { resultPathBase: null });
    openConfigPanel();
    fireEvent.click(screen.getByRole('button', { name: /emit debug/i }));

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored).toEqual([
      historySummary({
        job_id: 'job-debug',
        request_id: 'debug-request',
        ticker: 'AAPL',
        market: 'US',
        trade_date: '2026-05-14',
        decision: 'Buy',
        time_horizon_months: 2,
        analysis_created_at: expect.any(String),
      }),
    ]);
    expect(localStorage.getItem('analysis-history-test:result:debug-request')).toBeNull();
    expect(stored[0]).not.toHaveProperty('position_quantity');
    expect(stored[0]).not.toHaveProperty('average_entry_price');
    expect(stored[0]).not.toHaveProperty('raw_agent_state');
    expect(stored[0]).not.toHaveProperty('executive_summary');
  });

  it('persists every summary without a hard history cap', () => {
    function BatchForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() => {
            for (let i = 0; i < 12; i += 1) {
              onResult({
                job_id: `job-${i}`,
                request_id: `request-${i}`,
                ticker: `T${i}`,
                market: 'US',
                trade_date: `2026-05-${String(i + 1).padStart(2, '0')}`,
                response_detail: 'summary',
                decision: 'Hold',
              });
            }
          }}
        >
          Emit batch
        </button>
      );
    }

    renderWorkspace(BatchForm, 'analysis-history-test', '/analysis', { resultPathBase: null });
    openConfigPanel();
    fireEvent.click(screen.getByRole('button', { name: /emit batch/i }));

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored).toHaveLength(12);
    expect(stored[0]).toMatchObject({
      schema_version: 2,
      job_id: 'job-11',
      request_id: 'request-11',
      ticker: 'T11',
      trade_date: '2026-05-12',
    });
    expect(stored[11]).toMatchObject({
      schema_version: 2,
      job_id: 'job-0',
      request_id: 'request-0',
      ticker: 'T0',
      trade_date: '2026-05-01',
    });
  });

  it('navigates to the canonical job URL when a result arrives', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      completedJobResponse({ jobId: 'job-nav', requestId: 'request-nav', ticker: 'AAPL' })
    );

    function FullForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
              job_id: 'job-nav',
              request_id: 'request-nav',
              ticker: 'AAPL',
              market: 'US',
              trade_date: '2026-05-14',
              response_detail: 'full',
              decision: 'Buy',
            })
          }
        >
          Emit full
        </button>
      );
    }

    renderWorkspace(FullForm);
    openConfigPanel();
    fireEvent.click(screen.getByRole('button', { name: /emit full/i }));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/analysis/job-nav');
    });
  });

  it('migrates old history entries and removes legacy payload keys', () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'legacy-request',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-14',
          decision: 'Buy',
          saved_at: '2026-05-14T10:00:00.000Z',
          position_quantity: 10,
          average_entry_price: 150,
          raw_agent_state: { internal: true },
        },
      ])
    );
    localStorage.setItem(
      'analysis-history-test:result:legacy-request',
      JSON.stringify({ raw_agent_state: { internal: true } })
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openHistoryPanel();

    expect(JSON.parse(localStorage.getItem('analysis-history-test'))).toEqual([
      historySummary({
        request_id: 'legacy-request',
        ticker: 'AAPL',
        market: 'US',
        trade_date: '2026-05-14',
        decision: 'Buy',
        saved_at: '2026-05-14T10:00:00.000Z',
      }),
    ]);
    expect(localStorage.getItem('analysis-history-test:result:legacy-request')).toBeNull();
  });

  it('loads a direct URL from the backend and ignores legacy local payloads', async () => {
    localStorage.setItem(
      'analysis-history-test:result:job-1',
      JSON.stringify({
        job_id: 'job-1',
        request_id: 'request-local',
        ticker: 'AAPL',
        raw_agent_state: { internal: true },
      })
    );
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      completedJobResponse({
        result: {
          position_quantity: 20,
          average_entry_price: 200,
          raw_agent_state: { internal: true },
        },
      })
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis/job-1');

    expect(await screen.findByText('MSFT')).toBeTruthy();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/analysis/jobs/job-1'),
      expect.any(Object)
    );
    expect(localStorage.getItem('analysis-history-test:result:job-1')).toBeNull();

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored).toEqual([
      historySummary({
        job_id: 'job-1',
        request_id: 'request-backend',
        ticker: 'MSFT',
        market: 'US',
        trade_date: '2026-05-14',
        decision: 'Buy',
        time_horizon_months: 1,
        analysis_created_at: expect.any(String),
      }),
    ]);
    expect(stored[0]).not.toHaveProperty('position_quantity');
    expect(stored[0]).not.toHaveProperty('average_entry_price');
    expect(stored[0]).not.toHaveProperty('raw_agent_state');
  });

  it('fetches the backend again after a browser reload', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => completedJobResponse());

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis/job-1');
    expect(await screen.findByText('MSFT')).toBeTruthy();
    cleanup();

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis/job-1');
    expect(await screen.findByText('MSFT')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('shows an expired message when backend lookup misses', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => notFoundResponse());

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis/request-expired');

    expect(await screen.findByText('Result expired. Please submit a new analysis.')).toBeTruthy();
  });

  it('keeps global recent analyses in localStorage history', () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'global-request',
          ticker: '700.HK',
          market: 'GLOBAL',
          trade_date: '2026-05-14',
          decision: 'Hold',
          saved_at: new Date().toISOString(),
        },
        {
          request_id: 'us-request',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-14',
          decision: 'Buy',
          saved_at: new Date().toISOString(),
        },
        {
          request_id: 'id-request',
          ticker: 'BBCA.JK',
          market: 'ID',
          trade_date: '2026-05-14',
          decision: 'Hold',
          saved_at: new Date().toISOString(),
        },
      ])
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openHistoryPanel();

    expect(screen.getByText('700.HK')).toBeTruthy();
    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('BBCA.JK')).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored.map((item) => item.request_id)).toEqual([
      'global-request',
      'us-request',
      'id-request',
    ]);
    expect(stored.every((item) => item.schema_version === 2)).toBe(true);
  });

  it('clears summary history and legacy payload keys from the browser', () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          schema_version: 2,
          job_id: 'job-clear',
          request_id: 'request-clear',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-14',
          status: 'completed',
          decision: 'Buy',
          time_horizon_months: 1,
          analysis_created_at: '2026-05-14T10:00:00.000Z',
          saved_at: '2026-05-14T10:00:00.000Z',
        },
      ])
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm);
    openHistoryPanel();
    localStorage.setItem(
      'analysis-history-test:result:request-clear',
      JSON.stringify({ raw_agent_state: { internal: true } })
    );
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(localStorage.getItem('analysis-history-test')).toBeNull();
    expect(localStorage.getItem('analysis-history-test:result:request-clear')).toBeNull();
    expect(screen.queryByText('AAPL')).toBeNull();
  });

  it('loads recent analyses from the backend and caches summaries locally', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      expect(url).toContain('/analysis/history?limit=25');
      return new Response(
        JSON.stringify({
          items: [
            {
              job_id: 'job-db',
              request_id: 'request-db',
              ticker: 'MSFT',
              market: 'US',
              trade_date: '2026-05-28',
              decision: 'Buy',
              time_horizon_months: 1,
              analysis_created_at: '2026-05-28T08:00:00.000Z',
              updated_at: '2026-05-28T08:01:00.000Z',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis', {
      backendHistoryEnabled: true,
    });
    openHistoryPanel();

    expect(await screen.findByText('MSFT')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem('analysis-history-test'))).toEqual([
      historySummary({
        job_id: 'job-db',
        request_id: 'request-db',
        ticker: 'MSFT',
        market: 'US',
        trade_date: '2026-05-28',
        decision: 'Buy',
        time_horizon_months: 1,
        analysis_created_at: '2026-05-28T08:00:00.000Z',
        saved_at: '2026-05-28T08:01:00.000Z',
      }),
    ]);
  });

  it('opens a backend history item by request id through the history detail fallback', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
      if (url.includes('/analysis/history?')) {
        return new Response(
          JSON.stringify({
            items: [
              {
                job_id: 'job-global',
                request_id: 'request-global',
                ticker: 'MSFT',
                market: 'US',
                trade_date: '2026-05-28',
                decision: 'Buy',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.endsWith('/analysis/jobs/request-global')) {
        return new Response(JSON.stringify({ error: { message: 'Job not found' } }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/analysis/request-global')) {
        return notFoundResponse();
      }
      if (url.endsWith('/analysis/history/request-global')) {
        return new Response(
          JSON.stringify({
            job_id: 'job-global',
            request_id: 'request-global',
            ticker: 'MSFT',
            market: 'US',
            trade_date: '2026-05-28',
            decision: 'Buy',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis', {
      backendHistoryEnabled: true,
    });
    openHistoryPanel();

    fireEvent.click(await screen.findByText('MSFT'));

    await waitFor(() => {
      expect(screen.getByTestId('location').textContent).toBe('/analysis/request-global');
    });
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => url.endsWith('/analysis/history/request-global'))
      ).toBe(true);
    });
  });

  it('falls back to localStorage summaries when backend history fails', async () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'request-local-fallback',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-28',
          decision: 'Hold',
          saved_at: new Date().toISOString(),
        },
      ])
    );
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Backend unavailable'));

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis', {
      backendHistoryEnabled: true,
    });
    openHistoryPanel();

    expect(await screen.findByText('AAPL')).toBeTruthy();
  });

  it('clears backend and local history together', async () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'request-clear-db',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-28',
          decision: 'Buy',
          saved_at: new Date().toISOString(),
        },
      ])
    );
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Use local fallback'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ deleted: true, deleted_count: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis', {
      backendHistoryEnabled: true,
    });
    openHistoryPanel();

    expect(await screen.findByText('AAPL')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    await waitFor(() => expect(localStorage.getItem('analysis-history-test')).toBeNull());
    expect(fetchMock.mock.calls[1][0]).toBe('/api/analysis/history');
    expect(fetchMock.mock.calls[1][1].method).toBe('DELETE');
    expect(screen.queryByText('AAPL')).toBeNull();
  });

  it('keeps visible history and shows an error when backend clear fails', async () => {
    localStorage.setItem(
      'analysis-history-test',
      JSON.stringify([
        {
          request_id: 'request-clear-failed',
          ticker: 'AAPL',
          market: 'US',
          trade_date: '2026-05-28',
          decision: 'Buy',
          saved_at: new Date().toISOString(),
        },
      ])
    );
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('Use local fallback'))
      .mockRejectedValueOnce(new Error('Database unavailable'));

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis', {
      backendHistoryEnabled: true,
    });
    openHistoryPanel();

    expect(await screen.findByText('AAPL')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(await screen.findByText('Database unavailable')).toBeTruthy();
    expect(localStorage.getItem('analysis-history-test')).not.toBeNull();
    expect(screen.getByText('AAPL')).toBeTruthy();
  });
});
