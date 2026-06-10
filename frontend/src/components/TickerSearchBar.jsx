import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropTypes from 'prop-types';

import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';

const MIN_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

function formatPrice(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '—';
  return numberValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function displayBadge(item) {
  const exchange = String(item.exchange || '')
    .trim()
    .toUpperCase();
  const type = String(item.type || '')
    .trim()
    .toUpperCase();
  if (exchange && type) return `${exchange} · ${type}`;
  return exchange || type || 'YFINANCE';
}

export default function TickerSearchBar({
  value,
  onSelect,
  onClear,
  disabled = false,
  searchTickers = null,
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [open, setOpen] = useState(false);
  const [userEdited, setUserEdited] = useState(false);
  const rootRef = useRef(null);

  const trimmedQuery = useMemo(() => inputValue.trim(), [inputValue]);
  const canSearch = userEdited && trimmedQuery.length >= MIN_QUERY_LENGTH && !disabled;

  useEffect(() => {
    setInputValue(value || '');
    setUserEdited(false);
  }, [value]);

  useEffect(() => {
    function handleDocumentMouseDown(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  useEffect(() => {
    if (!canSearch) {
      setResults([]);
      setLoading(false);
      setSearchError('');
      setActiveIndex(-1);
      return undefined;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchError('');

      try {
        let data;
        if (searchTickers) {
          data = await searchTickers({ query: trimmedQuery, limit: 10, signal: controller.signal });
        } else {
          const response = await fetch(
            buildApiUrl(`/market/search?q=${encodeURIComponent(trimmedQuery)}&limit=10`),
            {
              headers: await buildAuthHeaders(),
              credentials: 'include',
              signal: controller.signal,
            }
          );

          if (!response.ok) throw new Error(await readHttpError(response));

          data = await response.json();
        }

        const nextResults = Array.isArray(data)
          ? data
          : Array.isArray(data.results)
            ? data.results
            : [];
        setResults(nextResults);
        setOpen(true);
        setActiveIndex(nextResults.length ? 0 : -1);
      } catch (error) {
        if (error.name === 'AbortError') return;
        setResults([]);
        setSearchError(error.message || 'Ticker search failed.');
        setOpen(true);
        setActiveIndex(-1);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canSearch, searchTickers, trimmedQuery]);

  function selectResult(item) {
    const symbol = String(item?.symbol || '')
      .trim()
      .toUpperCase();
    if (!symbol) return;
    setInputValue(symbol);
    setUserEdited(false);
    setOpen(false);
    setActiveIndex(-1);
    onSelect({ ...item, symbol });
  }

  function handleInputChange(event) {
    setInputValue(event.target.value.toUpperCase());
    setUserEdited(true);
    setOpen(true);
    setActiveIndex(-1);
    onClear();
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (!open || !results.length) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? results.length - 1 : current - 1));
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  const showDropdown = open && !disabled && (canSearch || loading || searchError);

  return (
    <div ref={rootRef} className="relative">
      <div
        className={`flex items-center border bg-black transition-colors duration-150 ${
          open
            ? 'border-bloomberg-orange'
            : 'border-bloomberg-border focus-within:border-bloomberg-orange'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <span className="pl-3 pr-2 font-mono text-sm text-bloomberg-muted">⌕</span>
        <input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (canSearch && results.length) setOpen(true);
          }}
          placeholder="Search ticker symbol..."
          disabled={disabled}
          className="w-full bg-black px-1 py-3 font-mono text-sm text-bloomberg-white tracking-wider placeholder:text-bloomberg-muted focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {showDropdown && (
        <div
          role="listbox"
          className="absolute left-0 right-0 z-50 mt-1 max-h-80 overflow-y-auto border border-bloomberg-border bg-black shadow-2xl shadow-black/70"
        >
          {loading && (
            <div className="px-3 py-3 font-mono text-xs text-bloomberg-muted tracking-wider">
              SEARCHING YFINANCE...
            </div>
          )}

          {!loading && searchError && (
            <div className="px-3 py-3 font-mono text-xs text-bloomberg-red tracking-wider">
              {searchError}
            </div>
          )}

          {!loading && !searchError && canSearch && !results.length && (
            <div className="px-3 py-3 font-mono text-xs text-bloomberg-muted tracking-wider">
              NO YFINANCE MATCHES
            </div>
          )}

          {!loading &&
            !searchError &&
            results.map((item, index) => (
              <button
                key={`${item.symbol}-${item.exchange || index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectResult(item);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`grid w-full grid-cols-[6rem_minmax(0,1fr)_8.5rem_5.5rem] items-center gap-3 border-b border-bloomberg-border px-3 py-2 text-left last:border-b-0 transition-colors duration-100 ${
                  activeIndex === index
                    ? 'bg-bloomberg-orange-dim'
                    : 'bg-black hover:bg-bloomberg-surface'
                }`}
              >
                <span className="truncate font-mono text-xs font-bold text-bloomberg-orange">
                  {String(item.symbol || '').toUpperCase()}
                </span>
                <span className="truncate font-mono text-xs text-bloomberg-white">
                  {item.name || '—'}
                </span>
                <span className="truncate border border-bloomberg-border bg-bloomberg-surface px-2 py-1 text-center font-mono text-[10px] text-bloomberg-muted">
                  {displayBadge(item)}
                </span>
                <span className="truncate text-right font-mono text-xs font-semibold text-bloomberg-white">
                  {formatPrice(item.price)}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

TickerSearchBar.propTypes = {
  value: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onClear: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  searchTickers: PropTypes.func,
};
