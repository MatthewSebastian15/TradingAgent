import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
  buildHeaders: async () => ({ 'Content-Type': 'application/json' }),
  readHttpError: async (res) => `HTTP ${res.status}`,
}));

import {
  getMarketMovers,
  getMarketOhlcv,
  getMarketOverview,
  getMarketPresets,
  getMarketQuotes,
  getMarketSparklines,
  getStockOverview,
  searchMarketTickers,
  validateMarketSymbol,
} from './market';

function okResponse(payload) {
  return { ok: true, json: async () => payload };
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(okResponse({ success: true }));
});

describe('market API getters', () => {
  it('getMarketPresets hits /market/presets', async () => {
    await getMarketPresets();
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market/presets');
  });

  it('validateMarketSymbol encodes the symbol', async () => {
    await validateMarketSymbol('^GSPC');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market/validate-symbol?symbol=%5EGSPC');
  });

  it('searchMarketTickers builds q/limit/market/type params', async () => {
    await searchMarketTickers('apple', { limit: 3, market: 'US', type: 'STOCK' });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/market/search?q=apple&limit=3&market=US&type=STOCK'
    );
  });

  it('getMarketOhlcv includes range and optional trade_date', async () => {
    await getMarketOhlcv('AAPL', { range: '3M', tradeDate: '2026-06-30' });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/market/ohlcv?ticker=AAPL&range=3M&trade_date=2026-06-30'
    );
  });

  it('getMarketQuotes joins symbol arrays', async () => {
    await getMarketQuotes(['AAPL', 'MSFT']);
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market/quotes?symbols=AAPL%2CMSFT');
  });

  it('getMarketSparklines passes symbols and range', async () => {
    await getMarketSparklines('AAPL', { range: '3M' });
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market/sparklines?symbols=AAPL&range=3M');
  });

  it('getStockOverview encodes the ticker', async () => {
    await getStockOverview('BBCA.JK');
    expect(globalThis.fetch.mock.calls[0][0]).toBe('/api/market/stock-overview?ticker=BBCA.JK');
  });

  it('getMarketMovers builds country/exchange/limit params', async () => {
    await getMarketMovers({ country: 'US', exchange: 'NASDAQ', limit: 5 });
    expect(globalThis.fetch.mock.calls[0][0]).toBe(
      '/api/market/movers?country=US&exchange=NASDAQ&limit=5'
    );
  });
});

describe('getMarketOverview', () => {
  it('POSTs the symbols in the body', async () => {
    await getMarketOverview(['^GSPC', '^IXIC']);
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('/api/market/overview');
    expect(options.method).toBe('POST');
    expect(JSON.parse(options.body)).toEqual({ symbols: ['^GSPC', '^IXIC'] });
    expect(options.cache).toBe('default');
  });

  it('adds force_refresh and no-store cache when refreshing', async () => {
    await getMarketOverview(['^GSPC'], { forceRefresh: true });
    const [url, options] = globalThis.fetch.mock.calls[0];
    expect(url).toContain('force_refresh=true');
    expect(options.cache).toBe('no-store');
  });
});

describe('error mapping', () => {
  it('throws the readHttpError message on non-ok responses', async () => {
    globalThis.fetch.mockResolvedValue({ ok: false, status: 503 });
    await expect(getMarketPresets()).rejects.toThrow('HTTP 503');
  });
});
