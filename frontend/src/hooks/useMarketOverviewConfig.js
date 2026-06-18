import { useCallback, useEffect, useState } from 'react';

import {
  MARKET_CATEGORIES,
  MARKET_DEFAULT_CATEGORY,
  MARKET_DEFAULT_SYMBOLS,
  MARKET_MAX_SYMBOLS,
  MARKET_MIN_SYMBOLS,
  MARKET_STORAGE_KEY,
  defaultSymbolsForCategory,
  normalizeMarketSymbol,
} from '../utils/marketDefaults';

function fallbackConfig() {
  return {
    category: MARKET_DEFAULT_CATEGORY,
    symbols: MARKET_DEFAULT_SYMBOLS,
  };
}

function readStoredConfig() {
  if (typeof window === 'undefined') return fallbackConfig();

  try {
    const parsed = JSON.parse(window.localStorage.getItem(MARKET_STORAGE_KEY) || 'null');
    const category = String(parsed?.category || '').trim();
    const symbols = Array.isArray(parsed?.symbols)
      ? parsed.symbols.map(normalizeMarketSymbol).filter(Boolean)
      : [];

    if (
      !MARKET_CATEGORIES.includes(category) ||
      symbols.length < MARKET_MIN_SYMBOLS ||
      symbols.length > MARKET_MAX_SYMBOLS
    ) {
      return fallbackConfig();
    }

    return { category, symbols: Array.from(new Set(symbols)) };
  } catch {
    return fallbackConfig();
  }
}

function writeStoredConfig(category, symbols) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MARKET_STORAGE_KEY, JSON.stringify({ category, symbols }));
  } catch {
    // Browser storage can fail. State still works for current session.
  }
}

export function useMarketOverviewConfig() {
  const initialConfig = readStoredConfig();
  const [activeCategory, setActiveCategory] = useState(initialConfig.category);
  const [symbols, setSymbols] = useState(initialConfig.symbols);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    writeStoredConfig(activeCategory, symbols);
  }, [activeCategory, symbols]);

  const addSymbol = useCallback(
    (symbol) => {
      const normalized = normalizeMarketSymbol(symbol);
      if (!normalized) return { ok: false, message: 'Symbol required.' };
      if (symbols.length >= MARKET_MAX_SYMBOLS) {
        setNotice('Maximum 6 instruments');
        return { ok: false, message: 'Maximum 6 instruments' };
      }
      if (symbols.includes(normalized)) {
        setNotice('Symbol already active.');
        return { ok: false, message: 'Symbol already active.' };
      }
      setSymbols([...symbols, normalized]);
      setNotice('');
      return { ok: true, message: '' };
    },
    [symbols]
  );

  const deleteSymbol = useCallback(
    (symbol) => {
      const normalized = normalizeMarketSymbol(symbol);
      if (symbols.length <= MARKET_MIN_SYMBOLS) {
        setNotice('Minimum 3 instruments required');
        return { ok: false, message: 'Minimum 3 instruments required' };
      }
      setSymbols(symbols.filter((item) => item !== normalized));
      setNotice('');
      return { ok: true, message: '' };
    },
    [symbols]
  );

  const changeCategory = useCallback((category) => {
    if (!MARKET_CATEGORIES.includes(category)) return;
    setActiveCategory(category);
    setSymbols(defaultSymbolsForCategory(category));
    setNotice('');
  }, []);

  return {
    activeCategory,
    symbols,
    notice,
    addSymbol,
    deleteSymbol,
    changeCategory,
    canAdd: symbols.length < MARKET_MAX_SYMBOLS,
    canDelete: symbols.length > MARKET_MIN_SYMBOLS,
  };
}
