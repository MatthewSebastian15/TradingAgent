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
              {...workspaceProps}
            />
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
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

  it('removes global recent analyses from localStorage history', () => {
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

    expect(screen.queryByText('700.HK')).toBeNull();
    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('BBCA.JK')).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored.map((item) => item.request_id)).toEqual(['us-request', 'id-request']);
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
    localStorage.setItem(
      'analysis-history-test:result:request-clear',
      JSON.stringify({ raw_agent_state: { internal: true } })
    );
    fireEvent.click(screen.getByRole('button', { name: /clear history/i }));

    expect(localStorage.getItem('analysis-history-test')).toBeNull();
    expect(localStorage.getItem('analysis-history-test:result:request-clear')).toBeNull();
    expect(screen.queryByText('AAPL')).toBeNull();
  });
});
