import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api/market', () => ({ getMarketQuotes: vi.fn() }));
vi.mock('../utils/marketBatch', () => ({
  QUOTE_TIMEOUT_MS: 15000,
  withDeadline: (run, { signal }) => run(signal),
  withRetry: (run) => run(),
}));
vi.mock('../hooks/useAnalysisHistoryStore', () => ({
  historyResourceId: (item) => item.request_id || item.job_id || null,
  normalizeBackendHistory: (items) =>
    items.map((item) => ({
      ...item,
      ticker: item.normalized_ticker || item.ticker,
      decision: item.final_decision || item.decision,
    })),
}));

import { fetchEntryPrice, signalFromResult, trackSignal } from './trackSignal';
import { getMarketQuotes } from '../api/market';

const signal = {
  id: 'r1',
  ticker: 'NVDA',
  market: 'US',
  decision: 'BUY',
  display_signal: 'Buy',
  confidence_score: 70,
  confidence_tier: 'high',
  time_horizon_months: 1,
  analysis_created_at: '2026-10-01T00:00:00Z',
  trade_date: '2026-10-01',
  stop_loss: 90,
  take_profit: 130,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('fetchEntryPrice', () => {
  it('returns the matching quote price', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: 101.5 }] });
    expect(await fetchEntryPrice('nvda')).toBe(101.5);
  });

  it('falls back to the only quote when the server canonicalized the symbol', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'BBCA.JK', price: 9500 }] });
    expect(await fetchEntryPrice('BBCA')).toBe(9500);
  });

  it('is null for a failed, zero or missing price', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: null, error: true }] });
    expect(await fetchEntryPrice('NVDA')).toBeNull();
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: 0 }] });
    expect(await fetchEntryPrice('NVDA')).toBeNull();
    getMarketQuotes.mockResolvedValue({ quotes: [] });
    expect(await fetchEntryPrice('NVDA')).toBeNull();
  });
});

describe('trackSignal', () => {
  it('saves a record with a frozen entry price and the analysis levels', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: 100 }] });
    const track = vi.fn(async () => ({ ok: true }));

    const outcome = await trackSignal(signal, { track });

    expect(outcome).toEqual({ ok: true, entryPrice: 100 });
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toMatchObject({
      id: 'r1',
      ticker: 'NVDA',
      decision: 'BUY',
      confidence_score: 70,
      time_horizon_months: 1,
      stop_loss: 90,
      take_profit: 130,
      entry_price: 100,
    });
    expect(Date.parse(track.mock.calls[0][0].entry_at)).not.toBeNaN();
  });

  it('does not save and reports no_price when the quote is unusable', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: null, error: true }] });
    const track = vi.fn();

    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'no_price' });
    expect(track).not.toHaveBeenCalled();
  });

  it('classifies timeout, network and abort failures', async () => {
    const track = vi.fn();

    getMarketQuotes.mockRejectedValue(Object.assign(new Error('t'), { code: 'TIMEOUT' }));
    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'timeout' });

    getMarketQuotes.mockRejectedValue(new TypeError('Failed to fetch'));
    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'network' });

    getMarketQuotes.mockRejectedValue(Object.assign(new Error('bad'), { status: 400 }));
    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'bad_symbol' });

    getMarketQuotes.mockRejectedValue(new DOMException('aborted', 'AbortError'));
    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'aborted' });
    expect(track).not.toHaveBeenCalled();
  });

  it('propagates a storage failure reason', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: 100 }] });
    const track = vi.fn(async () => ({ ok: false, reason: 'unreadable' }));

    expect(await trackSignal(signal, { track })).toEqual({ ok: false, reason: 'unreadable' });
  });

  it('treats a track function that resolves undefined as success (legacy callers)', async () => {
    getMarketQuotes.mockResolvedValue({ quotes: [{ sym: 'NVDA', price: 100 }] });
    expect((await trackSignal(signal, { track: vi.fn() })).ok).toBe(true);
  });
});

describe('signalFromResult', () => {
  it('maps a finished analysis to the sidebar signal shape', () => {
    const result = {
      request_id: 'r7',
      normalized_ticker: 'NVDA',
      ticker: 'nvda',
      final_decision: 'Buy',
      market: 'US',
      confidence_score: 70,
      time_horizon_months: 2,
      stop_loss: 90,
      take_profit: 130,
      trade_date: '2026-10-01',
    };

    expect(signalFromResult(result)).toMatchObject({ id: 'r7', ticker: 'NVDA', decision: 'Buy' });
  });

  it('is null for errors and for results without an id or ticker', () => {
    expect(signalFromResult(null)).toBeNull();
    expect(signalFromResult({ error: 'boom', request_id: 'r', ticker: 'X' })).toBeNull();
    expect(signalFromResult({ ticker: 'NVDA' })).toBeNull();
  });
});
