import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useMarketOverviewConfig } from './useMarketOverviewConfig';
import {
  MARKET_DEFAULT_CATEGORY,
  MARKET_DEFAULT_SYMBOLS,
  MARKET_MAX_SYMBOLS,
  MARKET_MIN_SYMBOLS,
  MARKET_STORAGE_KEY,
  defaultSymbolsForCategory,
} from '../utils/marketDefaults';

describe('useMarketOverviewConfig', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts from defaults and persists to localStorage', () => {
    const { result } = renderHook(() => useMarketOverviewConfig());

    expect(result.current.activeCategory).toBe(MARKET_DEFAULT_CATEGORY);
    expect(result.current.symbols).toEqual(MARKET_DEFAULT_SYMBOLS);
    expect(JSON.parse(window.localStorage.getItem(MARKET_STORAGE_KEY))).toEqual({
      category: MARKET_DEFAULT_CATEGORY,
      symbols: MARKET_DEFAULT_SYMBOLS,
    });
  });

  it('restores a stored config and falls back on corrupt data', () => {
    window.localStorage.setItem(
      MARKET_STORAGE_KEY,
      JSON.stringify({ category: 'FX', symbols: defaultSymbolsForCategory('FX') })
    );
    const stored = renderHook(() => useMarketOverviewConfig());
    expect(stored.result.current.activeCategory).toBe('FX');

    window.localStorage.setItem(MARKET_STORAGE_KEY, '{not json');
    const corrupt = renderHook(() => useMarketOverviewConfig());
    expect(corrupt.result.current.activeCategory).toBe(MARKET_DEFAULT_CATEGORY);
  });

  it('addSymbol normalizes, rejects duplicates and enforces the max', () => {
    const { result } = renderHook(() => useMarketOverviewConfig());

    // trim down to min first so there is room to add
    while (result.current.symbols.length > MARKET_MIN_SYMBOLS) {
      const last = result.current.symbols.at(-1);
      act(() => result.current.deleteSymbol(last));
    }

    act(() => {
      expect(result.current.addSymbol(' btc-usd ')).toEqual({ ok: true, message: '' });
    });
    expect(result.current.symbols).toContain('BTC-USD');

    act(() => {
      expect(result.current.addSymbol('btc-usd').ok).toBe(false);
    });
    expect(result.current.notice).toBe('Symbol already active.');

    act(() => result.current.addSymbol('A1'));
    act(() => result.current.addSymbol('A2'));
    expect(result.current.symbols).toHaveLength(MARKET_MAX_SYMBOLS);
    act(() => {
      expect(result.current.addSymbol('A3').ok).toBe(false);
    });
    expect(result.current.notice).toBe('Maximum 6 instruments');
    expect(result.current.canAdd).toBe(false);
  });

  it('deleteSymbol enforces the minimum', () => {
    const { result } = renderHook(() => useMarketOverviewConfig());

    while (result.current.symbols.length > MARKET_MIN_SYMBOLS) {
      const last = result.current.symbols.at(-1);
      act(() => result.current.deleteSymbol(last));
    }
    act(() => {
      expect(result.current.deleteSymbol(result.current.symbols[0]).ok).toBe(false);
    });
    expect(result.current.notice).toBe('Minimum 3 instruments required');
    expect(result.current.canDelete).toBe(false);
  });

  it('changeCategory swaps to that category defaults; unknown category is ignored', () => {
    const { result } = renderHook(() => useMarketOverviewConfig());

    act(() => result.current.changeCategory('CRYPTO'));
    expect(result.current.activeCategory).toBe('CRYPTO');
    expect(result.current.symbols).toEqual(defaultSymbolsForCategory('CRYPTO'));

    act(() => result.current.changeCategory('NOPE'));
    expect(result.current.activeCategory).toBe('CRYPTO');
  });
});
