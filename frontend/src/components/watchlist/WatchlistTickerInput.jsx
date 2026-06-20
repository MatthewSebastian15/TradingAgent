import { Search, X } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useRef } from 'react';

import { Input } from '@/components/ui/input';
import { useTickerSearch } from '@/hooks/useTickerSearch';
import { normalizeTickerSymbol, tickerExchangeLabel } from '@/utils/tickerSearch';

import { normalizeWatchlistSymbol } from '../../utils/watchlistFormatters';

const SEARCH_LIMIT = 10;

function tickerMarket(item) {
  return String(item?.market || '')
    .trim()
    .toUpperCase() || '-';
}

export default function WatchlistTickerInput({
  value,
  selectedTicker,
  onChange,
  onSelectTicker,
  onClear,
  onAdd,
  addDisabled,
  error,
  loading,
  disabled = false,
}) {
  const rootRef = useRef(null);
  const trimmedQuery = useMemo(() => value.trim(), [value]);
  const {
    results,
    recentResults,
    loading: searching,
    error: searchError,
    activeIndex,
    setActiveIndex,
    open,
    setOpen,
    selectTicker,
  } = useTickerSearch({
    query: trimmedQuery,
    enabled: !disabled,
    limit: SEARCH_LIMIT,
  });

  const displayResults = trimmedQuery ? results : recentResults;
  const showDropdown =
    open && !disabled && Boolean(displayResults.length || searching || searchError || trimmedQuery);

  useEffect(() => {
    function handleDocumentMouseDown(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, [setActiveIndex, setOpen]);

  function selectResult(item) {
    const selected = selectTicker(item);
    const symbol = normalizeWatchlistSymbol(selected?.symbol);
    if (!symbol) return;
    setOpen(false);
    setActiveIndex(-1);
    onSelectTicker({ ...selected, symbol });
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (open && activeIndex >= 0 && displayResults[activeIndex]) {
        selectResult(displayResults[activeIndex]);
        return;
      }
      onAdd();
      return;
    }

    if (!open || !displayResults.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % displayResults.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? displayResults.length - 1 : current - 1));
    }
  }

  return (
    <div ref={rootRef} className="space-y-1.5">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div
          className={`relative flex h-10 items-center border bg-black ${
            showDropdown
              ? 'border-bloomberg-orange'
              : 'border-bloomberg-border focus-within:border-bloomberg-orange'
          } ${disabled ? 'opacity-50' : ''}`}
        >
          <Search className="ml-3 mr-2 h-4 w-4 shrink-0 text-bloomberg-muted" />
          <Input
            type="text"
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            value={value}
            disabled={disabled}
            onChange={(event) => {
              onChange(event.target.value.toUpperCase());
              onClear();
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            placeholder="Search ticker symbol"
            className="h-9 border-0 bg-black px-1 font-mono text-xs uppercase tracking-wider text-bloomberg-white shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
          {selectedTicker && (
            <button
              type="button"
              aria-label="Clear selected ticker"
              onClick={onClear}
              className="mr-2 flex h-7 w-7 items-center justify-center text-bloomberg-muted hover:text-bloomberg-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

          {showDropdown && (
            <div
              role="listbox"
              className="absolute left-0 right-0 top-11 z-50 max-h-80 overflow-y-auto border border-bloomberg-border bg-black shadow-xl shadow-black/70"
            >
              {searching && !displayResults.length && (
                <div className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
                  SEARCHING...
                </div>
              )}
              {!displayResults.length && searchError && (
                <div className="px-3 py-2 font-mono text-xs text-bloomberg-red">
                  {searchError}
                </div>
              )}
              {!searching && !searchError && !displayResults.length && trimmedQuery && (
                <div className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
                  NO SYMBOL MATCHES
                </div>
              )}
              {displayResults.map((item, index) => (
                <button
                  key={`${item.symbol}-${item.exchange || item.type || index}`}
                  type="button"
                  role="option"
                  aria-selected={activeIndex === index}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectResult(item);
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                  className={`grid w-full grid-cols-[72px_1fr_120px_48px] items-center gap-2 border-b border-bloomberg-border px-3 py-2 text-left last:border-b-0 ${
                    activeIndex === index
                      ? 'bg-bloomberg-surface'
                      : 'bg-black hover:bg-bloomberg-surface'
                  }`}
                >
                  <span className="truncate font-mono text-xs font-bold text-bloomberg-orange">
                    {normalizeTickerSymbol(item.symbol)}
                  </span>
                  <span className="truncate font-mono text-xs text-bloomberg-white">
                    {item.name || item.symbol}
                  </span>
                  <span className="truncate text-right font-mono text-[10px] uppercase text-bloomberg-muted">
                    {tickerExchangeLabel(item)}
                  </span>
                  <span className="truncate text-right font-mono text-[10px] uppercase text-bloomberg-muted">
                    {tickerMarket(item)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled || loading}
          className="h-10 border border-bloomberg-orange bg-bloomberg-orange px-4 font-mono text-xs font-bold uppercase tracking-wider text-black hover:bg-orange-400 disabled:cursor-not-allowed disabled:border-bloomberg-border disabled:bg-bloomberg-surface disabled:text-bloomberg-muted"
        >
          {loading ? 'ADD...' : 'ADD'}
        </button>
      </div>

      {error && <div className="font-mono text-xs text-bloomberg-red">{error}</div>}
    </div>
  );
}

WatchlistTickerInput.propTypes = {
  value: PropTypes.string.isRequired,
  selectedTicker: PropTypes.shape({ symbol: PropTypes.string }),
  onChange: PropTypes.func.isRequired,
  onSelectTicker: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  addDisabled: PropTypes.bool.isRequired,
  error: PropTypes.string,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
};
