import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HistoryPanel, StatusBar } from './AnalysisWorkspacePanels';
import { clearHistory, readHistory, removeHistoryItem } from '../hooks/useAnalysisHistoryStore';

const ITEMS = [
  {
    request_id: 'r1',
    ticker: 'AAPL',
    decision: 'BUY',
    trade_date: '2026-06-01',
    confidence_score: 82,
    time_horizon_months: 1,
  },
  {
    request_id: 'r2',
    ticker: 'BBCA.JK',
    decision: 'HOLD',
    trade_date: '2026-06-02',
  },
];

vi.mock('../hooks/useAnalysisHistoryStore', () => ({
  clearHistory: vi.fn(async () => {}),
  confidenceScoreStyle: () => 'text-bloomberg-green',
  decisionStyle: () => 'text-bloomberg-green',
  formatHistoryHorizon: (months) => (months ? `${months}M` : ''),
  historyResourceId: (item) => item.request_id,
  normalizeBackendHistory: (items) => items,
  readHistory: vi.fn(async () => []),
  removeHistoryItem: vi.fn(async () => {}),
  writeHistory: vi.fn(async () => {}),
}));
vi.mock('../utils/analysisHistoryApi', () => ({
  clearAnalysisHistory: vi.fn(async () => {}),
  deleteAnalysisHistoryResult: vi.fn(async () => {}),
  fetchAnalysisHistory: vi.fn(async () => []),
}));

describe('StatusBar', () => {
  afterEach(() => cleanup());

  it('renders nothing when idle and the status while loading', () => {
    const { container } = render(<StatusBar loading={false} status="RUNNING" />);
    expect(container.firstChild).toBeNull();

    render(<StatusBar loading status="MARKET ANALYST..." />);
    expect(screen.getByText('MARKET ANALYST...')).toBeTruthy();

    cleanup();
    render(<StatusBar loading />);
    expect(screen.getByText('RUNNING...')).toBeTruthy();
  });
});

describe('HistoryPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  function renderPanel(props = {}) {
    const onSelect = vi.fn();
    render(
      <HistoryPanel
        backendHistoryEnabled={false}
        historyKey="ta_test_history"
        onSelect={onSelect}
        {...props}
      />
    );
    return { onSelect };
  }

  it('renders nothing while history is empty', async () => {
    const { container } = render(
      <HistoryPanel backendHistoryEnabled={false} historyKey="k" onSelect={vi.fn()} />
    );

    await waitFor(() => expect(readHistory).toHaveBeenCalled());
    expect(container.querySelector('button')).toBeNull();
  });

  it('lists local history items and selects one', async () => {
    readHistory.mockResolvedValue(ITEMS);
    const { onSelect } = renderPanel();

    expect(await screen.findByText('AAPL')).toBeTruthy();
    expect(screen.getByText('RECENT ANALYSES')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('82%')).toBeTruthy();

    fireEvent.click(screen.getByText('AAPL'));
    expect(onSelect).toHaveBeenCalledWith(ITEMS[0]);
  });

  it('clears all history', async () => {
    readHistory.mockResolvedValue(ITEMS);
    renderPanel();
    await screen.findByText('AAPL');

    fireEvent.click(screen.getByRole('button', { name: 'CLEAR ALL' }));

    await waitFor(() => expect(clearHistory).toHaveBeenCalledWith('ta_test_history'));
    expect(screen.queryByText('AAPL')).toBeNull();
  });

  it('deletes a single item', async () => {
    readHistory.mockResolvedValue(ITEMS);
    renderPanel();
    await screen.findByText('AAPL');

    fireEvent.click(screen.getAllByTitle('Delete this analysis')[0]);

    await waitFor(() =>
      expect(removeHistoryItem).toHaveBeenCalledWith('ta_test_history', ITEMS[0])
    );
    await waitFor(() => expect(screen.queryByText('AAPL')).toBeNull());
    expect(screen.getByText('BBCA.JK')).toBeTruthy();
  });
});
