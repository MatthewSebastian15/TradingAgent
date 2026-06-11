import { useEffect, useState } from 'react';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';

export const DEFAULT_TICKERS = [
  'BBCA',
  'BBRI',
  'TLKM',
  'NVDA',
  'AAPL',
  'TSLA',
  'MSFT',
  'META',
  'GOTO',
  'ASII',
];

export const EMPTY_CHANGE = '...';

const TICKER_REFRESH_MS = 2 * 60 * 1000;
const TICKER_CACHE_KEY = 'tradingagents:ticker-quotes:v1';
const TICKER_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export function fallbackTickerQuotes() {
  return DEFAULT_TICKERS.map((sym) => ({
    sym,
    chg: EMPTY_CHANGE,
    pos: true,
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
    return cached.quotes.length > 0 ? cached.quotes : null;
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
        const res = await fetch(buildApiUrl(`/market/quotes?symbols=${encodeURIComponent(symbols)}`), {
          headers: await buildAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json();

        if (!cancelled) {
          const nextQuotes =
            Array.isArray(data.quotes) && data.quotes.length > 0 ? data.quotes : fallbackTickerQuotes();
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
  }, []);

  return { quotes, fetchError };
}
