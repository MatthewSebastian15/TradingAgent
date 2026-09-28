import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OverviewSection } from './OverviewSection';

const props = {
  symbol: 'AAPL',
  windowLabel: '2025-09-12 → 2026-09-11 · 250 obs',
  vol: 25,
  benchVol: 17,
  regimeLabel: 'Normal',
  dd: -18,
  benchMaxDD: -12,
  currentDrawdown: -6,
  underwaterDays: 20,
  var95: -2.1,
  sharpeInfo: {
    sharpe: 1.1,
    standardError: 0.4,
    tStat: 2.6,
    probabilisticSharpe: 0.99,
    observations: 250,
  },
  benchStats: { beta: 1.2, alpha: 3.1, alphaTStat: 0.8, observations: 250 },
  benchLabel: 'S&P 500',
  benchStatus: 'ready',
  hurstInfo: { hurst: 0.52, standardError: 0.03, significant: false },
  observations: 250,
  onNavigate: vi.fn(),
};

describe('OverviewSection', () => {
  afterEach(() => cleanup());

  it('shows the summary, eight cards and benchmark comparisons', () => {
    render(<OverviewSection {...props} />);
    expect(screen.getByTestId('quant-summary').textContent).toContain(
      'AAPL has moved about 25.0% a year'
    );
    for (const label of [
      'Ann. Volatility',
      'Sharpe',
      'Max Drawdown',
      'From Peak',
      'VaR 95% (1D)',
      'Beta vs S&P 500',
      'Alpha (ann.)',
      'Hurst',
    ]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    expect(screen.getAllByText('vs S&P 500').length).toBe(2);
    expect(screen.getByText('20d underwater')).toBeTruthy();
  });

  it('separates loading from unavailable benchmark cards', () => {
    const { rerender } = render(
      <OverviewSection {...props} benchStats={null} benchStatus="loading" />
    );
    expect(screen.getByText('Loading Beta vs S&P 500')).toBeTruthy();
    rerender(<OverviewSection {...props} benchStats={null} benchStatus="unavailable" />);
    expect(screen.getAllByText('Unavailable')).toHaveLength(2);
  });

  it('jumps to detail sections', () => {
    render(<OverviewSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Risk detail' }));
    expect(props.onNavigate).toHaveBeenCalledWith('risk');
  });
});

describe('OverviewSection actions', () => {
  afterEach(() => cleanup());

  it('copies the summary to the clipboard', async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    render(<OverviewSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copy summary' }));
    await waitFor(() => expect(screen.getByText('Summary copied.')).toBeTruthy());
    expect(writeText.mock.calls[0][0]).toContain('AAPL · 2025-09-12 → 2026-09-11 · 250 obs');
    expect(writeText.mock.calls[0][0]).toContain('Sharpe: ▲ 1.10');
  });

  it('hides the chatbot button outside a router and navigates inside one', () => {
    render(<OverviewSection {...props} />);
    expect(screen.queryByRole('button', { name: 'Ask Chatbot' })).toBeNull();
    cleanup();

    function ChatProbe() {
      const location = useLocation();
      return <div data-testid="chat-prompt">{location.state?.prompt}</div>;
    }
    render(
      <MemoryRouter initialEntries={['/quant']}>
        <Routes>
          <Route path="/quant" element={<OverviewSection {...props} />} />
          <Route path="/chatbot" element={<ChatProbe />} />
        </Routes>
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask Chatbot' }));
    expect(screen.getByTestId('chat-prompt').textContent).toContain(
      'Explain these quant readings for AAPL'
    );
  });

  it('offers the report only when a past analysis is loaded', async () => {
    const onOpenReport = vi.fn(async () => {});
    render(<OverviewSection {...props} />);
    expect(screen.queryByRole('button', { name: 'Report with quant' })).toBeNull();
    cleanup();

    render(<OverviewSection {...props} onOpenReport={onOpenReport} />);
    fireEvent.click(screen.getByRole('button', { name: 'Report with quant' }));
    await waitFor(() => expect(onOpenReport).toHaveBeenCalled());
    expect(onOpenReport.mock.calls[0][0].rows.length).toBeGreaterThan(4);
  });
});
