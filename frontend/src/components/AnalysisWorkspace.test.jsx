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
          onClick={() => onResult({
            ticker: 'AAPL',
            trade_date: '2026-05-14',
            response_detail: 'debug',
            raw_agent_state: { internal: true },
          })}
        >
          Emit debug
        </button>
      );
    }

    renderWorkspace(DebugForm);
    fireEvent.click(screen.getByRole('button', { name: /emit debug/i }));

    expect(localStorage.getItem('analysis-history-test')).toBeNull();
  });

  it('persists only summary-safe fields for non-debug responses', () => {
    function FullForm({ onResult }) {
      return (
        <button
          type="button"
          onClick={() => onResult({
            ticker: 'AAPL',
            trade_date: '2026-05-14',
            response_detail: 'full',
            decision: 'Buy',
            executive_summary: 'Summary',
            investment_thesis: 'Long thesis should not be stored',
            raw_agent_state: { internal: true },
          })}
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
    });
    expect(stored[0]).not.toHaveProperty('investment_thesis');
    expect(stored[0]).not.toHaveProperty('raw_agent_state');
  });
});
