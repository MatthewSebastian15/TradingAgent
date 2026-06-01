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
  initialEntry = '/analysis'
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
            />
          }
        />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('AnalysisWorkspace history storage', () => {
  beforeEach(() => {
    sessionStorage.setItem('_ta_owner_token', 'test-owner-token');
    sessionStorage.setItem('_ta_owner_token_expires_at', String(Math.floor(Date.now() / 1000) + 3600));
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('persists full debug responses by request_id', () => {
    function DebugForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
              request_id: 'debug-request',
              ticker: 'AAPL',
              trade_date: '2026-05-14',
              response_detail: 'debug',
              raw_agent_state: { internal: true },
            })
          }
        >
          Emit debug
        </button>
      );
    }

    renderWorkspace(DebugForm);
    fireEvent.click(screen.getByRole('button', { name: /emit debug/i }));

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    const storedById = JSON.parse(
      localStorage.getItem('analysis-history-test:result:debug-request')
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      request_id: 'debug-request',
      response_detail: 'debug',
      raw_agent_state: { internal: true },
    });
    expect(storedById).toMatchObject({
      request_id: 'debug-request',
      response_detail: 'debug',
      raw_agent_state: { internal: true },
    });
  });

  it('persists the full non-debug response', () => {
    function FullForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
              request_id: 'full-request',
              ticker: 'AAPL',
              trade_date: '2026-05-14',
              response_detail: 'full',
              decision: 'Buy',
              executive_summary: 'Summary',
              investment_thesis: 'Long thesis should be stored',
              raw_agent_state: { internal: true },
            })
          }
        >
          Emit full
        </button>
      );
    }

    renderWorkspace(FullForm);
    fireEvent.click(screen.getByRole('button', { name: /emit full/i }));

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      request_id: 'full-request',
      ticker: 'AAPL',
      trade_date: '2026-05-14',
      response_detail: 'full',
      decision: 'Buy',
      executive_summary: 'Summary',
      investment_thesis: 'Long thesis should be stored',
      analysis_created_at: expect.any(String),
      raw_agent_state: { internal: true },
    });
  });

  it('persists every response without a hard history cap', () => {
    function BatchForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() => {
            for (let i = 0; i < 12; i += 1) {
              onResult({
                request_id: `request-${i}`,
                ticker: `T${i}`,
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

    renderWorkspace(BatchForm);
    fireEvent.click(screen.getByRole('button', { name: /emit batch/i }));

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored).toHaveLength(12);
    expect(stored[0]).toMatchObject({
      request_id: 'request-11',
      ticker: 'T11',
      trade_date: '2026-05-12',
    });
    expect(stored[11]).toMatchObject({
      request_id: 'request-0',
      ticker: 'T0',
      trade_date: '2026-05-01',
    });
  });

  it('navigates to the canonical job URL when a result arrives', async () => {
    function FullForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
              job_id: 'job-nav',
              request_id: 'request-nav',
              ticker: 'AAPL',
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

  it('loads a direct request URL from localStorage', async () => {
    localStorage.setItem(
      'analysis-history-test:result:request-local',
      JSON.stringify({
        request_id: 'request-local',
        ticker: 'AAPL',
        trade_date: '2026-05-14',
        response_detail: 'full',
        decision: 'Buy',
        saved_at: new Date().toISOString(),
      })
    );

    function EmptyForm() {
      return null;
    }

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis/request-local');

    expect(await screen.findByText('AAPL')).toBeTruthy();
  });

  it('falls back to the backend when localStorage misses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          job_id: 'job-1',
          request_id: 'request-backend',
          status: 'completed',
          result: {
            request_id: 'request-backend',
            ticker: 'MSFT',
            trade_date: '2026-05-14',
            response_detail: 'full',
            decision: 'Buy',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
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
    expect(localStorage.getItem('analysis-history-test:result:request-backend')).toBeTruthy();
  });

  it('shows an expired message when backend lookup misses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 'NOT_FOUND',
            message: 'Analysis result was not found.',
          },
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );

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

    renderWorkspace(EmptyForm, 'analysis-history-test', '/analysis');

    expect(screen.queryByText('700.HK')).toBeNull();
    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('BBCA.JK')).toBeTruthy();

    const stored = JSON.parse(localStorage.getItem('analysis-history-test'));
    expect(stored.map((item) => item.request_id)).toEqual(['us-request', 'id-request']);
  });
});
