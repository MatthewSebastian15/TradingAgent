import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Quant from './Quant';
import { getMarketOhlcv } from '../api/market';
import { fetchAnalysisHistoryResult } from '../utils/analysisHistoryApi';

vi.mock('../api/market', () => ({
  getMarketOhlcv: vi.fn(async () => ({
    points: [{ date: '2026-01-01', close: 1 }],
    currency: 'USD',
  })),
}));
vi.mock('../utils/analysisHistoryApi', () => ({
  fetchAnalysisHistory: vi.fn(async () => [
    { request_id: 'r1', ticker: 'BBCA.JK', trade_date: '2026-05-01', display_signal: 'BUY' },
  ]),
  fetchAnalysisHistoryResult: vi.fn(async () => ({
    price_chart: { points: [{ date: '2026-01-01', close: 2 }], currency: 'IDR' },
  })),
}));
vi.mock('../components/TickerSearchBar', () => {
  function TickerSearchBarStub({ onSubmit }) {
    return (
      <button type="button" onClick={() => onSubmit('nvda')}>
        search-submit
      </button>
    );
  }
  TickerSearchBarStub.propTypes = { onSubmit: PropTypes.func };
  return { default: TickerSearchBarStub };
});
vi.mock('../components/results/tabs/QuantPanel', () => {
  function QuantPanelStub({ points, currency, symbol, section, range }) {
    return (
      <div data-testid="quant-panel">
        {symbol}|{currency}|{points.length}|{section}|{range}
      </div>
    );
  }
  QuantPanelStub.propTypes = {
    points: PropTypes.array,
    currency: PropTypes.string,
    symbol: PropTypes.string,
    section: PropTypes.string,
    range: PropTypes.string,
  };
  return { default: QuantPanelStub };
});

describe('Quant page', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the idle prompt, range buttons and history', async () => {
    render(<Quant />);

    expect(screen.getByText(/Search a ticker or load a past analysis/)).toBeTruthy();
    for (const range of ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']) {
      expect(screen.getByRole('button', { name: range })).toBeTruthy();
    }
    expect(await screen.findByText('BBCA.JK')).toBeTruthy();
  });

  it('loads a searched ticker on the Overview section', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('quant-panel').textContent).toBe('NVDA|USD|1|overview|1Y')
    );
    expect(getMarketOhlcv).toHaveBeenCalledWith('NVDA', expect.objectContaining({ range: '1Y' }));
  });

  it('refetches when the range changes and marks it pressed', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));
    await screen.findByTestId('quant-panel');

    fireEvent.click(screen.getByRole('button', { name: '5Y' }));

    await waitFor(() =>
      expect(getMarketOhlcv).toHaveBeenCalledWith('NVDA', expect.objectContaining({ range: '5Y' }))
    );
    expect(screen.getByRole('button', { name: '5Y' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('loads a past analysis from the history list and resets the range to 1Y', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByRole('button', { name: '3M' }));
    fireEvent.click(await screen.findByText('BBCA.JK'));

    await waitFor(() =>
      expect(screen.getByTestId('quant-panel').textContent).toContain('BBCA.JK|IDR|1')
    );
    expect(fetchAnalysisHistoryResult).toHaveBeenCalledWith('r1', expect.anything());
    expect(screen.getByTestId('quant-panel').textContent).toContain('|1Y');
  });

  it('navigates sections from the grouped sidebar', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));
    await screen.findByTestId('quant-panel');

    const nav = screen.getByRole('navigation', { name: 'Quant sections' });
    expect(within(nav).getByText('Risk Analytics')).toBeTruthy();
    fireEvent.click(within(nav).getByRole('button', { name: 'Risk' }));

    expect(screen.getByTestId('quant-panel').textContent).toContain('|risk|');
    expect(within(nav).getByRole('button', { name: 'Risk' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(screen.queryByRole('button', { name: 'All' })).toBeNull();
  });

  it('collapses the sidebar into an icon rail', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));
    await screen.findByTestId('quant-panel');

    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Valuation' }));
    expect(screen.getByTestId('quant-panel').textContent).toContain('|valuation|');
    expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeTruthy();
  });

  it('starts from a quick ticker in the empty state', async () => {
    render(<Quant />);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Try a ticker' })).getByRole('button', {
        name: 'MSFT',
      })
    );
    await waitFor(() =>
      expect(screen.getByTestId('quant-panel').textContent).toContain('MSFT|USD|1')
    );
  });

  it('shows the recommendation next to each past analysis', async () => {
    render(<Quant />);
    const row = (await screen.findByText('BBCA.JK')).closest('button');
    expect(within(row).getByText('BUY')).toBeTruthy();
    expect(row.getAttribute('aria-label')).toBe(
      'Load BBCA.JK analysis from 2026-05-01, signal BUY'
    );
  });
});
