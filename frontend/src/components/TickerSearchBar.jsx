import { Search } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Input } from '@/components/ui/input';

import { buildApiUrl, buildAuthHeaders, readHttpError } from '../utils/api';
import { mergeTickerResults, searchLocalTickers } from '../utils/tickerSearch';

const MIN_QUERY_LENGTH = 1;
const REMOTE_MIN_QUERY_LENGTH = 2;
const SEARCH_REFRESH_DELAY_MS = 50;
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_PREFIX = 'ta:ticker-search:';
const SEARCH_LIMIT = 10;
const DROPDOWN_WIDTH = 520;

const searchMemoryCache = new Map();

function formatPrice(value) {
  if (value === null || value === undefined || value === '') return '-';
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '-';
  return numberValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function tickerName(item) {
  return String(item.name || item.shortName || item.longName || item.symbol || '-').trim();
}

function exchangeLabel(item) {
  const exchange = String(item.exchange || '')
    .trim()
    .toUpperCase();
  const type = String(item.quoteType || item.type || '')
    .trim()
    .toUpperCase();
  const market = String(item.market || '')
    .trim()
    .toUpperCase();
  const source = String(item.source || '')
    .trim()
    .toUpperCase();

  if (exchange && type) return `${exchange} · ${type}`;
  return exchange || type || market || source || '-';
}

function tickerPrice(item) {
  return item.regularMarketPrice ?? item.price ?? '-';
}

function normalizeQueryKey(query, limit) {
  return `${String(query || '')
    .trim()
    .toLowerCase()}::${limit}`;
}

function readStoredSearchCache(key) {
  const memoryValue = searchMemoryCache.get(key);
  const now = Date.now();
  if (memoryValue && now - memoryValue.cachedAt <= SEARCH_CACHE_TTL_MS) {
    return memoryValue.results.map((item) => ({ ...item }));
  }

  try {
    const raw = window.localStorage.getItem(`${SEARCH_CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || now - Number(parsed.cachedAt || 0) > SEARCH_CACHE_TTL_MS) return null;
    const results = Array.isArray(parsed.results) ? parsed.results : [];
    searchMemoryCache.set(key, { cachedAt: parsed.cachedAt, results });
    return results.map((item) => ({ ...item }));
  } catch {
    return null;
  }
}

function writeStoredSearchCache(key, results) {
  const payload = {
    cachedAt: Date.now(),
    results: results.map((item) => ({ ...item })),
  };
  searchMemoryCache.set(key, payload);

  try {
    window.localStorage.setItem(`${SEARCH_CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // Browser storage can be unavailable. Memory cache still covers this session.
  }
}

function normalizeSearchResponse(data) {
  return Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
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
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: DROPDOWN_WIDTH,
  });
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);
  const requestSeqRef = useRef(0);

  const trimmedQuery = useMemo(() => inputValue.trim(), [inputValue]);
  const canSearch = userEdited && trimmedQuery.length >= MIN_QUERY_LENGTH && !disabled;
  const canRefreshRemote =
    userEdited && trimmedQuery.length >= REMOTE_MIN_QUERY_LENGTH && !disabled;
  const showDropdown =
    open && !disabled && trimmedQuery.length > 0 && Boolean(canSearch || loading || searchError);

  const updateDropdownPosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth || DROPDOWN_WIDTH;
    setDropdownPosition({
      top: rect.bottom + 8,
      left: rect.left,
      width: Math.min(DROPDOWN_WIDTH, Math.max(320, viewportWidth - rect.left - 16)),
    });
  }, []);

  useEffect(() => {
    setInputValue(value || '');
    setUserEdited(false);
  }, [value]);

  useEffect(() => {
    function handleDocumentMouseDown(event) {
      const target = event.target;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }

    document.addEventListener('mousedown', handleDocumentMouseDown);
    return () => document.removeEventListener('mousedown', handleDocumentMouseDown);
  }, []);

  useEffect(() => {
    if (!showDropdown) return undefined;

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [showDropdown, inputValue, results.length, updateDropdownPosition]);

  useEffect(() => {
    if (!canSearch) {
      requestSeqRef.current += 1;
      setResults([]);
      setLoading(false);
      setSearchError('');
      setActiveIndex(-1);
      return;
    }

    const localResults = searchLocalTickers(trimmedQuery, SEARCH_LIMIT);
    const cachedResults =
      trimmedQuery.length >= REMOTE_MIN_QUERY_LENGTH
        ? readStoredSearchCache(normalizeQueryKey(trimmedQuery, SEARCH_LIMIT))
        : null;
    const nextResults = mergeTickerResults(localResults, cachedResults || []).slice(
      0,
      SEARCH_LIMIT
    );

    setResults(nextResults);
    setLoading(false);
    setSearchError('');
    setOpen(true);
    setActiveIndex(nextResults.length ? 0 : -1);
  }, [canSearch, trimmedQuery]);

  useEffect(() => {
    if (!canRefreshRemote) return undefined;

    const controller = new AbortController();
    const requestId = requestSeqRef.current + 1;
    requestSeqRef.current = requestId;
    const cacheKey = normalizeQueryKey(trimmedQuery, SEARCH_LIMIT);

    const timer = window.setTimeout(async () => {
      const instantResults = mergeTickerResults(
        searchLocalTickers(trimmedQuery, SEARCH_LIMIT),
        readStoredSearchCache(cacheKey) || []
      );
      setLoading((currentLoading) => currentLoading || instantResults.length === 0);

      try {
        let data;
        if (searchTickers) {
          data = await searchTickers({
            query: trimmedQuery,
            limit: SEARCH_LIMIT,
            signal: controller.signal,
          });
        } else {
          const response = await fetch(
            buildApiUrl(
              `/market/search?q=${encodeURIComponent(trimmedQuery)}&limit=${SEARCH_LIMIT}`
            ),
            {
              headers: await buildAuthHeaders(),
              credentials: 'include',
              signal: controller.signal,
            }
          );

          if (!response.ok) throw new Error(await readHttpError(response));
          data = await response.json();
        }

        if (controller.signal.aborted || requestSeqRef.current !== requestId) return;

        const remoteResults = normalizeSearchResponse(data);
        writeStoredSearchCache(cacheKey, remoteResults);
        const localResults = searchLocalTickers(trimmedQuery, SEARCH_LIMIT);
        const nextResults = mergeTickerResults(localResults, remoteResults).slice(0, SEARCH_LIMIT);
        setResults(nextResults);
        setOpen(true);
        setActiveIndex(nextResults.length ? 0 : -1);
      } catch (error) {
        if (error.name === 'AbortError' || requestSeqRef.current !== requestId) return;
        setSearchError(error.message || 'Ticker search failed.');
        setOpen(true);
      } finally {
        if (!controller.signal.aborted && requestSeqRef.current === requestId) {
          setLoading(false);
        }
      }
    }, SEARCH_REFRESH_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [canRefreshRemote, searchTickers, trimmedQuery]);

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

  const dropdown = showDropdown ? (
    <div
      ref={dropdownRef}
      role="listbox"
      className="fixed z-[9999] max-h-[420px] overflow-y-auto border border-bloomberg-border bg-black shadow-xl shadow-black/70"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      {loading && !results.length && (
        <div className="px-4 py-3 font-mono text-xs text-bloomberg-muted tracking-wider">
          SEARCHING CACHE...
        </div>
      )}

      {!results.length && searchError && (
        <div className="px-4 py-3 font-mono text-xs text-bloomberg-red tracking-wider">
          {searchError}
        </div>
      )}

      {!loading && !searchError && canSearch && !results.length && (
        <div className="px-4 py-3 font-mono text-xs text-bloomberg-muted tracking-wider">
          NO SYMBOL MATCHES
        </div>
      )}

      {results.map((item, index) => (
        <button
          key={`${item.symbol}-${item.exchange || item.quoteType || item.market || index}`}
          type="button"
          role="option"
          aria-selected={activeIndex === index}
          onMouseDown={(event) => {
            event.preventDefault();
            selectResult(item);
          }}
          onMouseEnter={() => setActiveIndex(index)}
          className={`grid w-full grid-cols-[88px_1fr_130px_90px] items-center gap-3 border-b border-bloomberg-border px-4 py-3 text-left last:border-b-0 cursor-pointer transition-colors duration-100 ${
            activeIndex === index ? 'bg-bloomberg-surface' : 'bg-black hover:bg-bloomberg-surface'
          }`}
        >
          <span className="truncate font-mono text-xs font-bold text-bloomberg-orange">
            {String(item.symbol || '').toUpperCase()}
          </span>
          <span className="truncate font-mono text-xs text-bloomberg-white">
            {tickerName(item)}
          </span>
          <span className="truncate border border-bloomberg-border px-2 py-1 text-center font-mono text-[10px] uppercase text-bloomberg-muted">
            {exchangeLabel(item)}
          </span>
          <span className="truncate text-right font-mono text-xs font-bold text-bloomberg-white">
            {formatPrice(tickerPrice(item))}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative overflow-visible">
      <div
        className={`flex items-center border bg-black transition-colors duration-150 ${
          open
            ? 'border-bloomberg-orange'
            : 'border-bloomberg-border focus-within:border-bloomberg-orange'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <Search className="ml-3 mr-2 h-4 w-4 shrink-0 text-bloomberg-muted" aria-hidden="true" />
        <Input
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
          placeholder="Search ticker symbol"
          disabled={disabled}
          className="h-12 border-0 bg-black px-1 font-mono text-sm tracking-wider shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed"
        />
      </div>

      {dropdown && createPortal(dropdown, document.body)}
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
