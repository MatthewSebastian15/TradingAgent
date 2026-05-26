import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import AnalysisWorkspace from './AnalysisWorkspace';

function renderWorkspace(FormComponent, historyKey = 'analysis-history-test') {
  return render(
    <MemoryRouter initialEntries={['/analysis']}>
      <AnalysisWorkspace
        FormComponent={FormComponent}
        historyKey={historyKey}
        emptyDescription="Empty"
      />
    </MemoryRouter>
  );
}

describe('AnalysisWorkspace history storage', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('does not persist debug responses to localStorage', () => {
    function DebugForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
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

    expect(localStorage.getItem('analysis-history-test')).toBeNull();
  });

  it('persists only display-safe fields for non-debug responses', () => {
    function FullForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() =>
            onResult({
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
      ticker: 'AAPL',
      trade_date: '2026-05-14',
      response_detail: 'full',
      decision: 'Buy',
      executive_summary: 'Summary',
      investment_thesis: 'Long thesis should be stored',
      analysis_created_at: expect.any(String),
    });
    expect(stored[0]).not.toHaveProperty('raw_agent_state');
  });

  it('persists every non-debug response without a hard history cap', () => {
    function BatchForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() => {
            for (let i = 0; i < 12; i += 1) {
              onResult({
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
      ticker: 'T11',
      trade_date: '2026-05-12',
    });
    expect(stored[11]).toMatchObject({
      ticker: 'T0',
      trade_date: '2026-05-01',
    });
  });
});
