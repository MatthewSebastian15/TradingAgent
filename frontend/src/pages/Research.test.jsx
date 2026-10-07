import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Research from './Research';
import { AI_AGENT_PATH } from '../constants/routes';
import { useQuoteLite } from '../hooks/useQuoteLite';
import { useStockOverview } from '../hooks/useStockOverview';
import { useWatchlistStore } from '../hooks/useWatchlistStore';

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
const navigateMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigateMock,
}));
vi.mock('../hooks/useWatchlistStore', () => ({
  useWatchlistStore: vi.fn(() => ({
    activeGroup: { id: 'g1', items: [] },
    hasTicker: () => false,
    addTicker: vi.fn(() => true),
  })),
}));
vi.mock('../components/TickerSearchBar', () => {
  function TickerSearchBarStub({ onSubmit }) {
    return (
      <button type="button" onClick={() => onSubmit('MSFT')}>
        submit-compare-ticker
      </button>
    );
  }
  TickerSearchBarStub.propTypes = { onSubmit: PropTypes.func };
  return { default: TickerSearchBarStub };
});
vi.mock('../components/research/NewsTab', () => ({
  default: function NewsTabStub({ ticker }) {
    return <div data-testid="news-tab">{ticker}</div>;
  },
}));
vi.mock('../hooks/useQuoteLite', () => ({
  useQuoteLite: vi.fn(() => ({ quote: null, updatedAt: null })),
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

  describe('live quote merge', () => {
    const original = useQuoteLite.getMockImplementation();
    afterEach(() => useQuoteLite.mockImplementation(original));

    it('shows the polled price/change over the cached fundamentals snapshot', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      useQuoteLite.mockImplementation(() => ({
        quote: { sym: 'AAPL', price: 220, volume: 5, error: false },
        updatedAt: 1,
      }));
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      // prev_close 200 from the snapshot, live price 220: +20.00 (+10.00%).
      expect(screen.getByText(/\+20\.00 \(\+10\.00%\)/)).toBeTruthy();
      expect(screen.queryByText(/\+10\.50 \(\+5\.25%\)/)).toBeNull();
    });

    it('falls back to the snapshot price when the quote has no price', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      useQuoteLite.mockImplementation(() => ({
        quote: { sym: 'AAPL', price: null, volume: null, error: true },
        updatedAt: null,
      }));
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(screen.getByText(/\+10\.50 \(\+5\.25%\)/)).toBeTruthy();
    });
  });

  describe('detail tabs', () => {
    const apiOk = (payload) => ({ ok: true, json: async () => payload });
    const callsTo = (spy, path) => spy.mock.calls.filter((c) => String(c[0]).includes(path)).length;

    function stubFetch() {
      return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/market/financials')) {
          return Promise.resolve(
            apiOk({
              statement: 'income',
              periods: [{ key: 'FY24', label: 'FY24' }],
              rows: [{ key: 'revenue', label: 'Revenue', values: { FY24: '100' } }],
              data_quality: { status: 'complete' },
            })
          );
        }
        if (u.includes('/market/technicals')) {
          return Promise.resolve(
            apiOk({ available: true, entry_quality: 'Acceptable Entry', trend: 'uptrend' })
          );
        }
        return Promise.resolve(apiOk({ points: [] }));
      });
    }

    it('lazily loads FINANCIALS only when its tab is opened', async () => {
      const fetchSpy = stubFetch();
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));
      await screen.findByText('NO CHART DATA');
      expect(callsTo(fetchSpy, '/market/financials')).toBe(0);

      fireEvent.click(screen.getByRole('button', { name: 'FINANCIALS' }));

      expect(await screen.findByText('Revenue')).toBeTruthy();
      expect(callsTo(fetchSpy, '/market/financials')).toBe(1);
      expect(screen.queryByText('PRICE CHART')).toBeNull();
    });

    it('switches between OVERVIEW, TECHNICALS and NEWS without losing the overview', async () => {
      const fetchSpy = stubFetch();
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));
      await screen.findByText('NO CHART DATA');

      fireEvent.click(screen.getByRole('button', { name: 'TECHNICALS' }));
      expect(await screen.findByText('Acceptable Entry')).toBeTruthy();
      expect(callsTo(fetchSpy, '/market/technicals')).toBe(1);

      fireEvent.click(screen.getByRole('button', { name: 'NEWS' }));
      expect(screen.getByTestId('news-tab').textContent).toBe('AAPL');

      fireEvent.click(screen.getByRole('button', { name: /OVERVIEW/ }));
      expect(screen.getByText('PRICE CHART')).toBeTruthy();
      expect(screen.getByText('Apple Inc.')).toBeTruthy();
    });

    it('marks the active tab and enables all four', () => {
      stubFetch();
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      for (const name of ['OVERVIEW', 'FINANCIALS', 'TECHNICALS', 'NEWS']) {
        const tab = screen.getByRole('button', { name: new RegExp(name) });
        expect(tab.disabled).toBe(false);
      }
      expect(screen.getByRole('button', { name: /OVERVIEW/ }).getAttribute('aria-current')).toBe(
        'true'
      );
    });
  });

  describe('MA overlay', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    const candles = [
      { date: '2026-01-01', open: 100, high: 130, low: 90, close: 120, volume: 1 },
      { date: '2026-01-02', open: 120, high: 140, low: 95, close: 110, volume: 1 },
    ];

    function withMa(ma50, ma200) {
      useStockOverview.mockImplementation((ticker) => ({
        loading: false,
        error: null,
        retry: vi.fn(),
        data: ticker
          ? { name: 'Apple Inc.', price: 110, prev_close: 100, ma_50d: ma50, ma_200d: ma200 }
          : null,
      }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ points: candles }),
      });
    }

    it('draws MA50 and MA200 lines from the overview fields', async () => {
      withMa(105, 115);
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(await screen.findByTestId('research-ma50-line')).toBeTruthy();
      expect(screen.getByTestId('research-ma200-line')).toBeTruthy();
    });

    it('omits a line whose value is missing', async () => {
      withMa(105, null);
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(await screen.findByTestId('research-ma50-line')).toBeTruthy();
      expect(screen.queryByTestId('research-ma200-line')).toBeNull();
    });
  });

  describe('trend widgets inside the cards', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    const ok = (payload) => Promise.resolve({ ok: true, json: async () => payload });

    function stub(overrides = {}) {
      useStockOverview.mockImplementation((ticker) => ({
        loading: false,
        error: null,
        retry: vi.fn(),
        data: ticker ? { ticker, name: 'Apple Inc.', price: 110, prev_close: 100 } : null,
      }));
      return vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
        const u = String(url);
        if (u.includes('/market/analyst-history')) {
          return ok(
            overrides.analyst ?? {
              history: [
                { period: '0m', strong_buy: 6, buy: 19, hold: 13, sell: 3, strong_sell: 3 },
              ],
            }
          );
        }
        if (u.includes('/market/growth-trend')) {
          return ok({
            quarters: [
              { period: '2025-12-31', revenue: 100, earnings: 10 },
              { period: '2026-03-31', revenue: 120, earnings: 12 },
            ],
          });
        }
        if (u.includes('/market/dividend-history')) {
          return ok({ payments: [{ date: '2026-05-11', amount: 0.27 }] });
        }
        return ok({ points: [] });
      });
    }

    it('shows rating history, growth sparkline and dividend history for the active ticker', async () => {
      const fetchSpy = stub();
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(await screen.findByTestId('analyst-history-strip')).toBeTruthy();
      expect(await screen.findByTestId('growth-sparkline')).toBeTruthy();
      expect(await screen.findByTestId('dividend-history')).toBeTruthy();
      const urls = fetchSpy.mock.calls.map((c) => String(c[0]));
      expect(urls.some((u) => u.includes('/market/analyst-history?ticker=AAPL'))).toBe(true);
      expect(urls.some((u) => u.includes('/market/growth-trend?ticker=AAPL'))).toBe(true);
      expect(urls.some((u) => u.includes('/market/dividend-history?ticker=AAPL'))).toBe(true);
    });

    it('keeps the rest of the card when a history request fails', async () => {
      stub({ analyst: null });
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
        String(url).includes('/market/analyst-history')
          ? Promise.reject(new Error('boom'))
          : ok({ points: [] })
      );
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(await screen.findByText('ANALYST CONSENSUS')).toBeTruthy();
      expect(screen.queryByTestId('analyst-history-strip')).toBeNull();
    });
  });

  describe('hub actions', () => {
    const originalOverview = useStockOverview.getMockImplementation();
    const originalWatchlist = useWatchlistStore.getMockImplementation();
    afterEach(() => {
      useStockOverview.mockImplementation(originalOverview);
      useWatchlistStore.mockImplementation(originalWatchlist);
      navigateMock.mockClear();
    });

    const overviewFor = (ticker) => ({
      loading: false,
      error: null,
      retry: vi.fn(),
      data: ticker
        ? {
            ticker,
            name: `${ticker} Inc.`,
            exchange: 'NMS',
            price: 10,
            prev_close: 9,
            recommendation: 'BUY',
          }
        : null,
    });

    function setup({ watchlist } = {}) {
      useStockOverview.mockImplementation(overviewFor);
      const addTicker = vi.fn(() => true);
      useWatchlistStore.mockImplementation(
        () =>
          watchlist ?? { activeGroup: { id: 'g1', items: [] }, hasTicker: () => false, addTicker }
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({ points: [] }),
      });
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));
      return { addTicker };
    }

    it('adds the researched ticker to the active watchlist group', () => {
      const { addTicker } = setup();

      fireEvent.click(screen.getByRole('button', { name: '+ WATCHLIST' }));

      expect(addTicker).toHaveBeenCalledTimes(1);
      expect(addTicker).toHaveBeenCalledWith(
        expect.objectContaining({ symbol: 'AAPL', name: 'AAPL Inc.', exchange: 'NMS' })
      );
    });

    it('shows the ticker as already in the watchlist and does not add it twice', () => {
      setup({
        watchlist: {
          activeGroup: { id: 'g1', items: [] },
          hasTicker: () => true,
          addTicker: vi.fn(),
        },
      });

      const button = screen.getByRole('button', { name: /IN WATCHLIST/ });
      expect(button.disabled).toBe(true);
    });

    it('disables adding when the user has no watchlist group', () => {
      setup({ watchlist: { activeGroup: null, hasTicker: () => false, addTicker: vi.fn() } });

      expect(screen.getByRole('button', { name: '+ WATCHLIST' }).disabled).toBe(true);
    });

    it('hands the ticker to the AI Agent page via router state', () => {
      setup();

      fireEvent.click(screen.getByRole('button', { name: 'RUN FULL ANALYSIS' }));

      expect(navigateMock).toHaveBeenCalledWith(AI_AGENT_PATH, {
        state: { prefillTicker: 'AAPL' },
      });
    });

    it('compares two tickers side by side and closes again', () => {
      setup();
      expect(screen.queryByTestId('compare-section')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: '+ COMPARE' }));
      fireEvent.click(screen.getByText('submit-compare-ticker'));

      const section = within(screen.getByTestId('compare-section'));
      expect(section.getByText('AAPL')).toBeTruthy();
      expect(section.getByText('MSFT')).toBeTruthy();
      for (const title of [
        'VALUATION MULTIPLES',
        'PROFITABILITY',
        'GROWTH & INCOME',
        'ANALYST CONSENSUS',
      ]) {
        expect(section.getAllByText(title)).toHaveLength(2);
      }
      expect(useStockOverview).toHaveBeenCalledWith('MSFT');

      fireEvent.click(screen.getByRole('button', { name: /CLOSE COMPARE/ }));
      expect(screen.queryByTestId('compare-section')).toBeNull();
    });

    it('keeps the primary overview usable while the comparison ticker fails to load', () => {
      setup();
      useStockOverview.mockImplementation((ticker) =>
        ticker === 'MSFT'
          ? { loading: false, error: 'boom', data: null, retry: vi.fn() }
          : overviewFor(ticker)
      );

      fireEvent.click(screen.getByRole('button', { name: '+ COMPARE' }));
      fireEvent.click(screen.getByText('submit-compare-ticker'));

      const section = within(screen.getByTestId('compare-section'));
      expect(section.getByText(/FAILED TO LOAD: boom/)).toBeTruthy();
      expect(section.getAllByText('VALUATION MULTIPLES')).toHaveLength(1);
      expect(screen.getByText('AAPL Inc.')).toBeTruthy();
    });
  });
});
