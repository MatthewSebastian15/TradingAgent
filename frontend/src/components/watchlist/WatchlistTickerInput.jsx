import { Search, X } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import { Input } from '@/components/ui/input';

import { searchMarketTickers } from '../../api/market';
import { mergeTickerResults, searchLocalTickers } from '../../utils/tickerSearch';
import { normalizeWatchlistSymbol } from '../../utils/watchlistFormatters';

const SEARCH_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 120;
const searchMemoryCache = new Map();

function normalizeSearchResponse(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
}

function exchangeLabel(item) {
  const exchange = String(item?.exchange || '')
    .trim()
    .toUpperCase();
  const type = String(item?.type || item?.quoteType || '')
    .trim()
    .toUpperCase();
  const market = String(item?.market || '')
    .trim()
    .toUpperCase();

  if (exchange && type) return `${exchange} · ${type}`;
  return exchange || type || market || '-';
}

function formatSuggestionPrice(item) {
  const value = item?.regularMarketPrice ?? item?.price;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';
  return numberValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  const [results, setResults] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [open, setOpen] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [searching, setSearching] = useState(false);
  const requestSeqRef = useRef(0);
  const rootRef = useRef(null);

  const trimmedQuery = useMemo(() => value.trim(), [value]);
  const canSearch = !disabled && trimmedQuery.length > 0;
  const canRemoteSearch = !disabled && trimmedQuery.length >= 2;

  useEffect(() => {
    if (!canSearch) {
      requestSeqRef.current += 1;
      setResults([]);
      setActiveIndex(-1);
      setOpen(false);
      setSearchError('');
      setSearching(false);
      return;
    }

    const localResults = searchLocalTickers(trimmedQuery, SEARCH_LIMIT);
    const cachedResults = searchMemoryCache.get(trimmedQuery.toLowerCase()) || [];
    const nextResults = mergeTickerResults(localResults, cachedResults).slice(0, SEARCH_LIMIT);

    setResults(nextResults);
    setActiveIndex(nextResults.length ? 0 : -1);
    setOpen(true);
    setSearchError('');
  }, [canSearch, trimmedQuery]);

  useEffect(() => {
    if (!canRemoteSearch) return undefined;

    const controller = new AbortController();
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;

    const timerId = window.setTimeout(async () => {
      try {
        setSearching(true);
        const data = await searchMarketTickers(trimmedQuery, {
          limit: SEARCH_LIMIT,
          signal: controller.signal,
        });
        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;

        const remoteResults = normalizeSearchResponse(data);
        searchMemoryCache.set(trimmedQuery.toLowerCase(), remoteResults);
        const nextResults = mergeTickerResults(
          searchLocalTickers(trimmedQuery, SEARCH_LIMIT),
          remoteResults
        ).slice(0, SEARCH_LIMIT);

        setResults(nextResults);
        setActiveIndex(nextResults.length ? 0 : -1);
        setOpen(true);
        setSearchError('');
      } catch (err) {
        if (err.name === 'AbortError' || requestSeqRef.current !== requestId) return;
        setSearchError(results.length ? '' : 'Ticker search failed.');
        setOpen(true);
      } finally {
        if (!controller.signal.aborted && requestSeqRef.current === requestId) {
          setSearching(false);
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timerId);
      controller.abort();
    };
  }, [canRemoteSearch, results.length, trimmedQuery]);

  useEffect(() => {
    function handleDocumentMouseDown(event) {
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  function selectResult(item) {
    const symbol = normalizeWatchlistSymbol(item?.symbol);
    if (!symbol) return;
    setOpen(false);
    setActiveIndex(-1);
    onSelectTicker({ ...item, symbol });
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
      if (open && activeIndex >= 0 && results[activeIndex]) {
        selectResult(results[activeIndex]);
        return;
      }
      onAdd();
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
    }
  }

  const showDropdown = open && canSearch;

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
            }}
            onFocus={() => canSearch && setOpen(true)}
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
              {searching && !results.length && (
                <div className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
                  Searching...
                </div>
              )}
              {!results.length && searchError && (
                <div className="px-3 py-2 font-mono text-xs text-bloomberg-red">{searchError}</div>
              )}
              {!searching && !searchError && !results.length && (
                <div className="px-3 py-2 font-mono text-xs uppercase tracking-wider text-bloomberg-muted">
                  No symbol matches
                </div>
              )}
              {results.map((item, index) => (
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
                  className={`grid w-full grid-cols-[72px_1fr_120px_78px] items-center gap-2 border-b border-bloomberg-border px-3 py-2 text-left last:border-b-0 ${
                    activeIndex === index
                      ? 'bg-bloomberg-surface'
                      : 'bg-black hover:bg-bloomberg-surface'
                  }`}
                >
                  <span className="truncate font-mono text-xs font-bold text-bloomberg-orange">
                    {normalizeWatchlistSymbol(item.symbol)}
                  </span>
                  <span className="truncate font-mono text-xs text-bloomberg-white">
                    {item.name || item.symbol}
                  </span>
                  <span className="truncate text-right font-mono text-[10px] uppercase text-bloomberg-muted">
                    {exchangeLabel(item)}
                  </span>
                  <span className="truncate text-right font-mono text-xs text-bloomberg-white">
                    {formatSuggestionPrice(item)}
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
