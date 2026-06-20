import { normalizeTickerSearchResult } from './tickerSearch';

const RECENT_TICKERS_KEY = 'ta:recent-tickers';
const MAX_RECENT_TICKERS = 20;

function canUseStorage() {
  return typeof window !== 'undefined' && window.localStorage;
}

function readStoredRecentTickers() {
  try {
    if (!canUseStorage()) return [];
    const raw = window.localStorage.getItem(RECENT_TICKERS_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredRecentTickers(items) {
  try {
    if (!canUseStorage()) return;
    window.localStorage.setItem(RECENT_TICKERS_KEY, JSON.stringify(items));
  } catch {
    // Ignore storage errors.
  }
}

export function readRecentTickers({ limit = 10 } = {}) {
  return readStoredRecentTickers()
    .map((item) => normalizeTickerSearchResult({ ...item, source: item.source || 'recent' }))
    .filter((item) => item.symbol)
    .sort((left, right) => Number(right.selectedAt || 0) - Number(left.selectedAt || 0))
    .slice(0, limit);
}

export function saveRecentTicker(item) {
  const normalized = {
    ...normalizeTickerSearchResult(item),
    source: 'recent',
    selectedAt: Date.now(),
  };
  if (!normalized.symbol) return normalized;

  const nextItems = [
    normalized,
    ...readStoredRecentTickers().filter(
      (current) => String(current?.symbol || '').toUpperCase() !== normalized.symbol
    ),
  ].slice(0, MAX_RECENT_TICKERS);
  writeStoredRecentTickers(nextItems);
  return normalized;
}

export function removeRecentTicker(symbol) {
  const normalizedSymbol = String(symbol || '')
    .trim()
    .toUpperCase();
  const nextItems = readStoredRecentTickers().filter(
    (item) => String(item?.symbol || '').toUpperCase() !== normalizedSymbol
  );
  writeStoredRecentTickers(nextItems);
  return nextItems;
}

export function clearRecentTickers() {
  try {
    if (canUseStorage()) window.localStorage.removeItem(RECENT_TICKERS_KEY);
  } catch {
    // Ignore storage errors.
  }
}
