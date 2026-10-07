import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('../components/research/ResearchSidebar', () => {
  function ResearchSidebarStub({ collapsed }) {
    return <div data-testid="research-sidebar" data-collapsed={String(collapsed)} />;
  }
  ResearchSidebarStub.propTypes = { collapsed: PropTypes.bool };
  return { default: ResearchSidebarStub };
});
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

    expect(screen.getByText(/enter a ticker above/i)).toBeTruthy();
    expect(screen.getByTestId('research-sidebar')).toBeTruthy();
  });

  it('renders the empty-state message in the primary text colour, not the muted label colour', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    const message = screen.getByText(/enter a ticker above/i);
    expect(message.className).not.toMatch(/text-bloomberg-muted/);
    expect(message.className).toMatch(/text-bloomberg-white/);
  });

  it('gives range, description, retry and example buttons a visible focus ring', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);
    expect(screen.getByRole('button', { name: 'AAPL' }).className).toMatch(/focus-visible:outline/);

    fireEvent.click(screen.getByText('submit-ticker'));
    const range = await screen.findByRole('button', { name: '1M' });
    expect(range.className).toMatch(/focus-visible:outline/);
  });

  it('lets the user load an example ticker from the empty state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    fireEvent.click(screen.getByRole('button', { name: 'AAPL' }));

    expect(await screen.findByText('Apple Inc.')).toBeTruthy();
    expect(screen.queryByText(/enter a ticker above/i)).toBeNull();
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

    it('shows a freshness badge next to the price once a quote has arrived', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      useQuoteLite.mockImplementation(() => ({
        quote: { sym: 'AAPL', price: 220, volume: 5, error: false },
        updatedAt: Date.now(),
      }));
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(screen.getByText(/live just now/i)).toBeTruthy();
    });

    it('shows no freshness badge before the first quote', () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      render(<Research />);

      fireEvent.click(screen.getByText('submit-ticker'));

      expect(screen.queryByText(/just now|ago/i)).toBeNull();
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

    it('keeps a visited tab mounted so returning to it does not refetch', async () => {
      const fetchSpy = stubFetch();
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));
      await screen.findByText('NO CHART DATA');

      fireEvent.click(screen.getByRole('button', { name: 'FINANCIALS' }));
      await screen.findByText('Revenue');
      fireEvent.click(screen.getByRole('button', { name: /OVERVIEW/ }));
      fireEvent.click(screen.getByRole('button', { name: 'FINANCIALS' }));

      expect(screen.getByText('Revenue')).toBeTruthy();
      expect(callsTo(fetchSpy, '/market/financials')).toBe(1);
    });

    it('marks the active tab and enables all four', () => {
      stubFetch();
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      for (const name of ['OVERVIEW', 'FINANCIALS', 'TECHNICALS', 'NEWS']) {
        const tab = screen.getByRole('button', { name: new RegExp(name) });
        expect(tab.disabled).toBe(false);
      }
      expect(screen.getByRole('button', { name: /OVERVIEW/ }).getAttribute('aria-pressed')).toBe(
        'true'
      );
      expect(screen.getByRole('button', { name: 'FINANCIALS' }).getAttribute('aria-pressed')).toBe(
        'false'
      );
    });

    it('gives every tab an explicit focus ring', () => {
      stubFetch();
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      for (const name of ['OVERVIEW', 'FINANCIALS', 'TECHNICALS', 'NEWS']) {
        expect(screen.getByRole('button', { name: new RegExp(name) }).className).toMatch(
          /focus-visible:outline-bloomberg-orange/
        );
      }
    });
  });

  describe('responsive layout', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('stacks every overview grid to one column on mobile', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      const expectations = {
        'research-chart-row': [/grid-cols-1/, /lg:grid-cols-3/],
        'research-overview-grid-1': [/grid-cols-1/, /md:grid-cols-2/, /lg:grid-cols-3/],
        'research-overview-grid-2': [/grid-cols-1/, /md:grid-cols-2/, /lg:grid-cols-3/],
        'research-side-by-side-grid': [/grid-cols-1/, /md:grid-cols-2/],
      };
      for (const [testId, patterns] of Object.entries(expectations)) {
        const grid = await screen.findByTestId(testId);
        for (const pattern of patterns) expect(grid.className).toMatch(pattern);
      }
      expect((await screen.findByTestId('research-chart-col')).className).toMatch(
        /col-span-1.*lg:col-span-2/
      );
    });

    it('force-collapses the sidebar on a mobile-width viewport', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn((query) => ({
          matches: query === '(max-width: 767px)',
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      render(<Research />);

      expect(screen.getByTestId('research-sidebar').dataset.collapsed).toBe('true');
    });

    it('leaves the sidebar expanded on a desktop-width viewport', () => {
      vi.stubGlobal(
        'matchMedia',
        vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
      );
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      render(<Research />);

      expect(screen.getByTestId('research-sidebar').dataset.collapsed).toBe('false');
    });
  });

  describe('loading skeletons', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    const fullData = {
      name: 'Apple Inc.',
      price: 110,
      prev_close: 100,
      description: 'x'.repeat(50),
    };

    it('marks loading cards aria-busy and reserves every content slot', () => {
      useStockOverview.mockImplementation(() => ({ loading: true, error: null, data: null }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      const { container } = render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0);
      expect(container.querySelectorAll('[data-skeleton-slot="stat"]').length).toBe(2);
      expect(container.querySelectorAll('[data-skeleton-slot="description"]').length).toBe(1);
    });

    it('matches the skeleton slots one-to-one with the loaded content slots', async () => {
      useStockOverview.mockImplementation((ticker) => ({
        loading: false,
        error: null,
        data: ticker ? fullData : null,
      }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      const { container } = render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      await screen.findByText('NO CHART DATA'); // OHLCV fetch settled
      expect(container.querySelectorAll('[data-content-slot="stat"]').length).toBe(2);
      expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0);
    });
  });

  describe('failed overview load', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    it('does not leave the cards aria-busy after the load failed', async () => {
      useStockOverview.mockImplementation(() => ({
        loading: false,
        error: 'boom',
        retry: vi.fn(),
        data: null,
      }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
      const { container } = render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      await screen.findByText('NO CHART DATA'); // OHLCV fetch settled
      expect(container.querySelectorAll('[aria-busy="true"]').length).toBe(0);
    });
  });

  describe('price chart range transition', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    const candles = [
      { date: '2026-01-01', open: 100, high: 130, low: 90, close: 120, volume: 1 },
      { date: '2026-01-02', open: 120, high: 140, low: 95, close: 110, volume: 1 },
    ];

    it('keeps the previous range visible, faded, while a new range loads', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
        String(url).includes('range=1M')
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, json: async () => ({ points: candles }) })
      );
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));
      await screen.findAllByText('VOLUME');

      fireEvent.click(screen.getByRole('button', { name: '1M' }));

      expect(screen.getAllByText('VOLUME').length).toBeGreaterThan(0);
      expect(screen.queryByText('NO CHART DATA')).toBeNull();
      const body = screen.getByTestId('price-chart-body');
      expect(body.className).toMatch(/opacity-40/);
      expect(body.className).toMatch(/motion-reduce:transition-none/);
    });

    it('keeps labelling the faded chart with the range its data belongs to', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation((url) =>
        String(url).includes('range=1M')
          ? new Promise(() => {})
          : Promise.resolve({ ok: true, json: async () => ({ points: candles }) })
      );
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));
      await screen.findAllByText('VOLUME');
      expect(screen.getByTestId('price-chart-body').getAttribute('data-range')).toBe('1Y');

      fireEvent.click(screen.getByRole('button', { name: '1M' }));

      expect(screen.getByTestId('price-chart-body').getAttribute('data-range')).toBe('1Y');
    });
  });

  describe('screen-reader semantics', () => {
    const original = useStockOverview.getMockImplementation();
    afterEach(() => useStockOverview.mockImplementation(original));

    beforeEach(() => {
      useStockOverview.mockImplementation((ticker) => ({
        loading: false,
        error: null,
        retry: vi.fn(),
        data: ticker
          ? {
              name: 'Apple Inc.',
              price: 150,
              prev_close: 140,
              week_52_low: 100,
              week_52_high: 200,
              target_low: 100,
              target_high: 200,
              description: 'x'.repeat(250),
            }
          : null,
      }));
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    });

    it('describes both range positions in words', async () => {
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      expect(await screen.findByText(/50% of the way from the 52-week low to high/)).toBeTruthy();
      expect(screen.getByText(/50% of the way from the low to high analyst target/)).toBeTruthy();
    });

    it('announces the description expand/collapse state', async () => {
      render(<Research />);
      fireEvent.click(screen.getByText('submit-ticker'));

      const toggle = await screen.findByRole('button', { name: /show more/i });
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggle);
      expect(screen.getByRole('button', { name: /show less/i }).getAttribute('aria-expanded')).toBe(
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

    it('sends a fresh profile (no group) to the watchlist page instead of adding', () => {
      const addTicker = vi.fn();
      navigateMock.mockClear();
      setup({ watchlist: { activeGroup: null, hasTicker: () => false, addTicker } });

      const button = screen.getByRole('button', { name: '+ WATCHLIST' });
      expect(button.disabled).toBe(false);
      fireEvent.click(button);

      expect(addTicker).not.toHaveBeenCalled();
      expect(navigateMock).toHaveBeenCalledWith('/watchlist');
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
      // The primary's own copies of those cards are not rendered a second time below.
      expect(screen.getAllByText('VALUATION MULTIPLES')).toHaveLength(2);
      expect(screen.getByText('DIVIDENDS & YIELD')).toBeTruthy();

      fireEvent.click(screen.getByRole('button', { name: /CLOSE COMPARE/ }));
      expect(screen.getAllByText('VALUATION MULTIPLES')).toHaveLength(1);
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
