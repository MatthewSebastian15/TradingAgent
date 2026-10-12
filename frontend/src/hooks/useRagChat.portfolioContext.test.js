import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../services/holdingsStore', () => ({ readHoldings: vi.fn() }));
vi.mock('../services/watchlistStorage', () => ({ readWatchlistState: vi.fn() }));
vi.mock('../api/market', () => ({ getMarketQuotes: vi.fn() }));
vi.mock('../api/ragChat', () => ({ fetchRagChat: vi.fn() }));

import { buildPortfolioContext } from './useRagChat';
import { getMarketQuotes } from '../api/market';
import { readHoldings } from '../services/holdingsStore';

const lot = (ticker, shares = 1, cost_basis = 10) => ({
  id: `id-${ticker}-${shares}`,
  ticker,
  shares,
  cost_basis,
  added_at: '2026-01-01T00:00:00.000Z',
  schema_version: 1,
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildPortfolioContext', () => {
  it('returns null for scopes that exclude the portfolio without reading it', async () => {
    expect(await buildPortfolioContext('news')).toBeNull();
    expect(await buildPortfolioContext('watchlist')).toBeNull();
    expect(readHoldings).not.toHaveBeenCalled();
  });

  it('returns null when there are no holdings', async () => {
    readHoldings.mockResolvedValue([]);
    expect(await buildPortfolioContext('portfolio')).toBeNull();
    expect(getMarketQuotes).not.toHaveBeenCalled();
  });

  it('reads quotes from the { quotes: [...] } response object (the original bug)', async () => {
    readHoldings.mockResolvedValue([lot('AAPL', 10, 150)]);
    getMarketQuotes.mockResolvedValue({
      quotes: [{ sym: 'AAPL', price: 190, currency: 'USD', error: false }],
    });

    const context = await buildPortfolioContext('portfolio');

    expect(context.quotes).toEqual([{ sym: 'AAPL', price: 190, currency: 'USD', error: false }]);
    expect(context.holdings).toEqual([{ ticker: 'AAPL', shares: 10, cost_basis: 150 }]);
    expect(typeof context.fetched_at).toBe('string');
  });

  it('de-duplicates symbols across lots and normalizes case', async () => {
    readHoldings.mockResolvedValue([lot('aapl', 1), lot('AAPL', 2), lot(' msft ', 3)]);
    getMarketQuotes.mockResolvedValue({ quotes: [] });

    const context = await buildPortfolioContext('all');

    expect(getMarketQuotes).toHaveBeenCalledTimes(1);
    expect(getMarketQuotes.mock.calls[0][0]).toEqual(['AAPL', 'MSFT']);
    expect(context.holdings).toHaveLength(3); // every lot still reaches the LLM
  });

  it('batches more than 20 symbols', async () => {
    const tickers = Array.from({ length: 45 }, (_, index) => `T${index}`);
    readHoldings.mockResolvedValue(tickers.map((ticker) => lot(ticker)));
    getMarketQuotes.mockImplementation(async (batch) => ({
      quotes: batch.map((sym) => ({ sym, price: 1 })),
    }));

    const context = await buildPortfolioContext('portfolio');

    const sizes = getMarketQuotes.mock.calls.map(([batch]) => batch.length).sort((a, b) => b - a);
    expect(sizes).toEqual([20, 20, 5]);
    expect(context.quotes).toHaveLength(45);
  });

  it('stays non-fatal when quotes fail', async () => {
    readHoldings.mockResolvedValue([lot('AAPL')]);
    getMarketQuotes.mockRejectedValue(new Error('quotes down'));

    const context = await buildPortfolioContext('portfolio');

    expect(context.quotes).toEqual([]);
    expect(context.holdings).toHaveLength(1);
  });

  it('passes the abort signal to the quotes client', async () => {
    readHoldings.mockResolvedValue([lot('AAPL')]);
    getMarketQuotes.mockResolvedValue({ quotes: [] });
    const controller = new AbortController();

    await buildPortfolioContext('portfolio', controller.signal);

    expect(getMarketQuotes.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });
});
