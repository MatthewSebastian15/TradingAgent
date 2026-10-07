import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Research from './Research';
import { useStockOverview } from '../hooks/useStockOverview';

vi.mock('../components/research/ResearchCommandBar', () => {
  function ResearchCommandBarStub({ onSubmit }) {
    return (
      <button type="button" onClick={() => onSubmit({ symbol: 'AAPL' })}>
        submit-ticker
      </button>
    );
  }
  ResearchCommandBarStub.propTypes = { onSubmit: PropTypes.func };
  return { default: ResearchCommandBarStub };
});
vi.mock('../components/research/ResearchSidebar', () => ({
  default: function ResearchSidebarStub() {
    return <div data-testid="research-sidebar" />;
  },
}));
vi.mock('../hooks/useStockOverview', () => ({
  useStockOverview: vi.fn((ticker) =>
    ticker
      ? {
          loading: false,
          error: null,
          data: {
            name: 'Apple Inc.',
            sector: 'Technology',
            price: 210.5,
            prev_close: 200,
            market_cap: 3.2e12,
            recommendation: 'BUY',
          },
        }
      : { loading: false, error: null, data: null }
  ),
}));
vi.mock('../utils/recentTickers', () => ({
  saveRecentTicker: vi.fn(),
}));
vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
}));

describe('Research page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the empty prompt before a ticker is chosen', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    expect(screen.getByText('Enter a ticker to load stock overview')).toBeTruthy();
    expect(screen.getByTestId('research-sidebar')).toBeTruthy();
  });

  it('loads the overview cards after a ticker is submitted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    fireEvent.click(screen.getByText('submit-ticker'));

    expect(await screen.findByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('Technology')).toBeTruthy();
    expect(screen.getByText('3.20T')).toBeTruthy();
    // Change vs prev close: +10.50 (+5.25%).
    expect(screen.getByText(/\+10\.50 \(\+5\.25%\)/)).toBeTruthy();
    for (const title of ['PRICE CHART', 'TRADING DATA', 'VALUATION MULTIPLES', 'RISK ASSESSMENT']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(await screen.findByText('NO CHART DATA')).toBeTruthy();
  });

  it('serves already-loaded and prefetched OHLCV ranges from cache', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({ points: [] }),
    });
    const rangeCalls = (range) =>
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes(`range=${range}`)).length;
    render(<Research />);

    fireEvent.click(screen.getByText('submit-ticker'));
    await waitFor(() => expect(rangeCalls('1Y')).toBe(1));
    await waitFor(() => expect(rangeCalls('6M')).toBe(1)); // prefetched neighbour

    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    await waitFor(() => expect(rangeCalls('1M')).toBe(1));
    fireEvent.click(screen.getByRole('button', { name: '1Y' }));
    fireEvent.click(screen.getByRole('button', { name: '6M' }));
    await screen.findByText('NO CHART DATA');

    expect(rangeCalls('1Y')).toBe(1);
    expect(rangeCalls('6M')).toBe(1);
  });

  describe('overview data-quality states', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    function withOverview(state) {
      useStockOverview.mockImplementation((ticker) =>
        ticker
          ? { loading: false, error: null, data: null, retry: vi.fn(), ...state }
          : { loading: false, error: null, data: null, retry: vi.fn() }
      );
    }

    it('shows the error with a RETRY button wired to retry()', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      const retry = vi.fn();
      withOverview({ error: 'boom', retry });
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));
      expect(screen.getByText(/FAILED TO LOAD: boom/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'RETRY' }));

      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('treats data_quality "unavailable" as a retryable failure', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      const retry = vi.fn();
      withOverview({
        data: { ticker: 'AAPL', price: null, name: null, data_quality: 'unavailable' },
        retry,
      });
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));
      expect(screen.getByText(/VENDOR DATA UNAVAILABLE/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'RETRY' }));

      expect(retry).toHaveBeenCalledTimes(1);
    });

    it('shows a non-blocking notice for data_quality "partial"', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      withOverview({ data: { ticker: 'AAPL', price: 10, name: null, data_quality: 'partial' } });
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(screen.getByText(/Some fields unavailable/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'RETRY' })).toBeNull();
    });

    it('shows nothing extra for complete data', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      withOverview({
        data: { ticker: 'AAPL', price: 10, name: 'Apple', data_quality: 'complete' },
      });
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(screen.queryByText(/Some fields unavailable/)).toBeNull();
      expect(screen.queryByText(/VENDOR DATA UNAVAILABLE/)).toBeNull();
    });
  });

  it('ignores a late OHLCV response for a range that is no longer active', async () => {
    let resolveLate;
    const twoPoints = [
      { date: '2026-01-01', open: 1, high: 2, low: 1, close: 2, volume: 1 },
      { date: '2026-01-02', open: 2, high: 3, low: 2, close: 3, volume: 1 },
    ];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).includes('range=1M')) {
        return new Promise((resolve) => {
          resolveLate = () => resolve({ ok: true, json: async () => ({ points: twoPoints }) });
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({ points: [] }) });
    });
    render(<Research />);

    fireEvent.click(screen.getByText('submit-ticker'));
    await screen.findByText('NO CHART DATA');
    fireEvent.click(screen.getByRole('button', { name: '1M' }));
    await waitFor(() => expect(resolveLate).toBeTypeOf('function'));
    fireEvent.click(screen.getByRole('button', { name: '1Y' }));
    await screen.findByText('NO CHART DATA');

    resolveLate();
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.getByText('NO CHART DATA')).toBeTruthy();
  });
});
