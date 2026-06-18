import { useEffect, useMemo, useState } from 'react';

import { buildApiUrl, buildAuthHeaders } from '../utils/api';

export const GLOBAL_TICKER_TAPE = [
  { label: 'S&P', name: 'S&P 500 Futures', ticker: 'ES=F' },
  { label: 'NDX', name: 'Nasdaq 100 Futures', ticker: 'NQ=F' },
  { label: 'VIX', name: 'Volatility Index', ticker: '^VIX' },
  { label: 'DXY', name: 'US Dollar Index', ticker: 'DX-Y.NYB' },
  { label: '10Y', name: 'US 10Y Treasury Yield', ticker: '^TNX' },
  { label: 'BTC', name: 'Bitcoin', ticker: 'BTC-USD' },
  { label: 'WTI', name: 'WTI Crude Oil', ticker: 'CL=F' },
  { label: 'GOLD', name: 'Gold Futures', ticker: 'GC=F' },
  { label: 'N225', name: 'Nikkei 225', ticker: '^N225' },
  { label: 'JKSE', name: 'Jakarta Composite Index', ticker: '^JKSE' },
];

export const DEFAULT_TICKERS = GLOBAL_TICKER_TAPE.map((item) => item.ticker);
export const EMPTY_CHANGE = '...';

const TICKER_REFRESH_MS = 2 * 60 * 1000;
const TICKER_CACHE_KEY = 'tradingagents:ticker-quotes:v3';
const TICKER_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function withTickerLabels(quotes) {
  const quotesBySymbol = new Map(
    Array.isArray(quotes) ? quotes.map((quote) => [quote.sym, quote]) : []
  );

  return GLOBAL_TICKER_TAPE.map((item) => ({
    ...item,
    ...(quotesBySymbol.get(item.ticker) || {}),
    label: item.label,
    name: item.name,
    ticker: item.ticker,
    sym: item.ticker,
  }));
}

export function fallbackTickerQuotes() {
  return GLOBAL_TICKER_TAPE.map((item) => ({
    ...item,
    sym: item.ticker,
    chg: EMPTY_CHANGE,
    pos: true,
    price: null,
  }));
}

function tickerCacheKey() {
  return `${TICKER_CACHE_KEY}:${DEFAULT_TICKERS.join('|')}`;
}

function readTickerCache() {
  if (typeof window === 'undefined') return null;

  try {
    const cached = JSON.parse(window.localStorage.getItem(tickerCacheKey()) || 'null');
    if (!cached || !Array.isArray(cached.quotes)) return null;
    if (Date.now() - Number(cached.savedAt || 0) > TICKER_CACHE_MAX_AGE_MS) return null;
    return cached.quotes.length > 0 ? withTickerLabels(cached.quotes) : null;
  } catch {
    return null;
  }
}

function writeTickerCache(quotes) {
  if (typeof window === 'undefined' || !Array.isArray(quotes) || quotes.length === 0) return;

  try {
    window.localStorage.setItem(tickerCacheKey(), JSON.stringify({ savedAt: Date.now(), quotes }));
  } catch {
    // Ignore cache failures. The fallback ticker tape still renders immediately.
  }
}

export function useTickerQuotes() {
  const fallbackQuotes = useMemo(() => fallbackTickerQuotes(), []);
  const [quotes, setQuotes] = useState(() => readTickerCache() || fallbackTickerQuotes());
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();

      try {
        const symbols = DEFAULT_TICKERS.join(',');
        const res = await fetch(
          buildApiUrl(`/market/quotes?symbols=${encodeURIComponent(symbols)}`),
          {
            headers: await buildAuthHeaders(),
            credentials: 'include',
            signal: controller.signal,
          }
        );

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (!cancelled) {
          const nextQuotes =
            Array.isArray(data.quotes) && data.quotes.length > 0
              ? withTickerLabels(data.quotes)
              : fallbackQuotes;
          setQuotes(nextQuotes);
          writeTickerCache(nextQuotes);
          setFetchError(false);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;
        if (!cancelled) setFetchError(true);
      }
    }

    load();
    const interval = setInterval(load, TICKER_REFRESH_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(interval);
    };
  }, [fallbackQuotes]);

  return { quotes, fetchError };
}
