import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { validateMarketSymbol } from '../../api/market';
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
  MARKET_MAX_SYMBOLS,
  MARKET_PRESETS,
  normalizeMarketSymbol,
} from '../../utils/marketDefaults';

export default function MarketOverviewPicker({
  activeCategory,
  existingSymbols,
  onAddSymbol,
  onClose,
}) {
  const [pickerCategory, setPickerCategory] = useState(activeCategory);
  const [search, setSearch] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [message, setMessage] = useState('');
  const [validating, setValidating] = useState(false);

  const filteredPresets = useMemo(() => {
    const query = search.trim().toUpperCase();
    return (MARKET_PRESETS[pickerCategory] || []).filter((item) => {
      if (!query) return true;
      return item.label.toUpperCase().includes(query) || item.symbol.toUpperCase().includes(query);
    });
  }, [pickerCategory, search]);

  async function addSymbol(symbol) {
    const normalized = normalizeMarketSymbol(symbol);
    if (!normalized) {
      setMessage('Symbol required.');
      return;
    }
    if (existingSymbols.length >= MARKET_MAX_SYMBOLS) {
      setMessage('Maximum 6 instruments');
      return;
    }
    if (existingSymbols.includes(normalized)) {
      setMessage('Symbol already active.');
      return;
    }

    setValidating(true);
    setMessage('');
    try {
      const result = await validateMarketSymbol(normalized);
      if (!result.valid) {
        setMessage(result.reason || 'No yfinance data found');
        return;
      }
      const added = onAddSymbol(normalized);
      if (!added.ok) {
        setMessage(added.message);
        return;
      }
      setCustomSymbol('');
      onClose();
    } catch (error) {
      setMessage(error.message || 'No yfinance data found');
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 px-4 pt-24">
      <div className="w-full max-w-2xl border border-bloomberg-border bg-black font-mono shadow-2xl shadow-black">
        <div className="flex items-center justify-between border-b border-bloomberg-border bg-bloomberg-orange px-3 py-2">
          <div className="text-xs font-bold uppercase tracking-widest text-black">Add Market</div>
          <button type="button" onClick={onClose} className="text-xs font-bold text-black">
            X
          </button>
        </div>

        <div className="grid gap-3 p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_12rem]">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="SEARCH PRESET"
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs text-bloomberg-white outline-none focus:border-bloomberg-orange"
            />
            <select
              value={pickerCategory}
              onChange={(event) => setPickerCategory(event.target.value)}
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs text-bloomberg-white outline-none focus:border-bloomberg-orange"
            >
              {MARKET_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {MARKET_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </div>

          <div className="max-h-72 overflow-y-auto border border-bloomberg-border">
            {filteredPresets.map((item) => {
              const disabled = existingSymbols.includes(item.symbol) || validating;
              return (
                <button
                  key={item.symbol}
                  type="button"
                  disabled={disabled}
                  onClick={() => addSymbol(item.symbol)}
                  className={`grid w-full grid-cols-[1fr_8rem_4rem] items-center gap-3 border-b border-bloomberg-border px-3 py-2 text-left text-xs last:border-b-0 ${
                    disabled
                      ? 'cursor-not-allowed text-bloomberg-subtle'
                      : 'text-bloomberg-white hover:bg-bloomberg-surface'
                  }`}
                >
                  <span className="truncate font-bold text-bloomberg-orange">{item.label}</span>
                  <span className="truncate text-bloomberg-muted">{item.symbol}</span>
                  <span className="text-right text-bloomberg-amber">ADD</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-2 md:grid-cols-[1fr_8rem]">
            <input
              type="text"
              value={customSymbol}
              onChange={(event) => setCustomSymbol(event.target.value.toUpperCase())}
              placeholder="CUSTOM SYMBOL"
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs text-bloomberg-white outline-none focus:border-bloomberg-orange"
            />
            <button
              type="button"
              disabled={validating}
              onClick={() => addSymbol(customSymbol)}
              className="border border-bloomberg-orange bg-bloomberg-orange px-3 py-2 text-xs font-bold text-black disabled:cursor-wait disabled:opacity-60"
            >
              {validating ? 'CHECK' : 'ADD'}
            </button>
          </div>

          {message && <div className="text-[11px] text-bloomberg-red">{message}</div>}
        </div>
      </div>
    </div>
  );
}

MarketOverviewPicker.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  existingSymbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  onAddSymbol: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
