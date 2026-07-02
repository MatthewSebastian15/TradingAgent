import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    { request_id: 'r1', ticker: 'BBCA.JK', trade_date: '2026-05-01' },
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
  function QuantPanelStub({ points, currency, symbol, sections }) {
    return (
      <div data-testid="quant-panel">
        {symbol}|{currency}|{points.length}|{sections.join(',')}
      </div>
    );
  }
  QuantPanelStub.propTypes = {
    points: PropTypes.array,
    currency: PropTypes.string,
    symbol: PropTypes.string,
    sections: PropTypes.array,
  };
  return { default: QuantPanelStub };
});

describe('Quant page', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows the idle prompt and range/tab controls', async () => {
    render(<Quant />);

    expect(screen.getByText(/Search a ticker or load a past analysis/)).toBeTruthy();
    for (const range of ['1M', '3M', '6M', 'YTD', '1Y', '2Y', '5Y']) {
      expect(screen.getByRole('button', { name: range })).toBeTruthy();
    }
    expect(await screen.findByText('BBCA.JK')).toBeTruthy();
  });

  it('loads a searched ticker into the quant panel', async () => {
    render(<Quant />);

    fireEvent.click(screen.getByText('search-submit'));

    await waitFor(() =>
      expect(screen.getByTestId('quant-panel').textContent).toContain('NVDA|USD|1')
    );
    expect(getMarketOhlcv).toHaveBeenCalledWith('NVDA', expect.objectContaining({ range: '1Y' }));
  });

  it('refetches when the range changes', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));
    await screen.findByTestId('quant-panel');

    fireEvent.click(screen.getByRole('button', { name: '5Y' }));

    await waitFor(() =>
      expect(getMarketOhlcv).toHaveBeenCalledWith('NVDA', expect.objectContaining({ range: '5Y' }))
    );
  });

  it('loads a past analysis from the history list', async () => {
    render(<Quant />);

    fireEvent.click(await screen.findByText('BBCA.JK'));

    await waitFor(() =>
      expect(screen.getByTestId('quant-panel').textContent).toContain('BBCA.JK|IDR|1')
    );
    expect(fetchAnalysisHistoryResult).toHaveBeenCalledWith('r1', expect.anything());
  });

  it('toggles section visibility including the All switch', async () => {
    render(<Quant />);
    fireEvent.click(screen.getByText('search-submit'));
    const panel = await screen.findByTestId('quant-panel');
    expect(panel.textContent).toContain('volatility');

    fireEvent.click(screen.getByRole('button', { name: /Volatility/ }));
    expect(screen.getByTestId('quant-panel').textContent).not.toContain('volatility');

    // "All" turns everything off when everything minus one is a mixed state → toggles to all-on.
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(screen.getByTestId('quant-panel').textContent).toContain('volatility');
  });
});
