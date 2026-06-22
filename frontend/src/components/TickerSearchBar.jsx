import { Search } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Input } from '@/components/ui/input';
import { useTickerSearch } from '@/hooks/useTickerSearch';
import { useTickerSearchWarmup } from '@/hooks/useTickerSearchWarmup';
import { normalizeTickerSymbol, tickerExchangeLabel } from '@/utils/tickerSearch';

const SEARCH_LIMIT = 10;
const DROPDOWN_WIDTH = 480;

function tickerName(item) {
  return String(item.name || item.shortName || item.longName || item.symbol || '-').trim();
}

function tickerMarket(item) {
  return (
    String(item.market || '')
      .trim()
      .toUpperCase() || '-'
  );
}

export default function TickerSearchBar({
  value,
  onSelect,
  onClear,
  disabled = false,
  searchTickers = null,
  placeholder = 'Search ticker symbol',
  bare = false,
  onSubmit = null,
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [userEdited, setUserEdited] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: DROPDOWN_WIDTH,
  });
  const rootRef = useRef(null);
  const dropdownRef = useRef(null);

  useTickerSearchWarmup({ enabled: !disabled });

  const trimmedQuery = useMemo(() => inputValue.trim(), [inputValue]);
  const {
    results,
    recentResults,
    loading,
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
    searchTickers,
  });

  const displayResults = trimmedQuery ? results : recentResults;
  const showDropdown =
    open && !disabled && Boolean(displayResults.length || loading || searchError);

  const updateDropdownPosition = useCallback(() => {
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewportWidth = window.innerWidth || DROPDOWN_WIDTH;
    setDropdownPosition({
      top: rect.bottom + 6,
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
  }, [setActiveIndex, setOpen]);

  useEffect(() => {
    if (!showDropdown) return undefined;

    updateDropdownPosition();
    window.addEventListener('resize', updateDropdownPosition);
    window.addEventListener('scroll', updateDropdownPosition, true);
    return () => {
      window.removeEventListener('resize', updateDropdownPosition);
      window.removeEventListener('scroll', updateDropdownPosition, true);
    };
  }, [showDropdown, inputValue, displayResults.length, updateDropdownPosition]);

  function selectResult(item) {
    const selected = selectTicker(item);
    if (!selected.symbol) return;
    setInputValue(selected.symbol);
    setUserEdited(false);
    setOpen(false);
    setActiveIndex(-1);
    onSelect(selected);
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

    if (event.key === 'Enter' && activeIndex < 0 && onSubmit) {
      const raw = inputValue.trim().toUpperCase();
      if (raw) {
        event.preventDefault();
        setOpen(false);
        setActiveIndex(-1);
        onSubmit(raw);
      }
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
      return;
    }

    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectResult(displayResults[activeIndex]);
    }
  }

  const dropdown = showDropdown ? (
    <div
      ref={dropdownRef}
      role="listbox"
      className="fixed z-[9999] max-h-[320px] overflow-y-auto border border-bloomberg-border bg-black shadow-xl shadow-black/70"
      style={{
        top: dropdownPosition.top,
        left: dropdownPosition.left,
        width: dropdownPosition.width,
      }}
    >
      {loading && !displayResults.length && (
        <div className="px-3 py-2 font-mono text-[11px] tracking-wider text-bloomberg-muted">
          SEARCHING...
        </div>
      )}

      {!displayResults.length && searchError && (
        <div className="px-3 py-2 font-mono text-[11px] tracking-wider text-bloomberg-red">
          {searchError}
        </div>
      )}

      {!loading && !searchError && !displayResults.length && userEdited && (
        <div className="px-3 py-2 font-mono text-[11px] tracking-wider text-bloomberg-muted">
          NO SYMBOL MATCHES
        </div>
      )}

      {displayResults.map((item, index) => (
        <button
          key={`${item.symbol}-${item.exchange || item.type || item.market || index}`}
          type="button"
          role="option"
          aria-selected={activeIndex === index}
          onMouseDown={(event) => {
            event.preventDefault();
            selectResult(item);
          }}
          onMouseEnter={() => setActiveIndex(index)}
          className={`grid w-full cursor-pointer grid-cols-[76px_1fr_122px_52px] items-center gap-2 border-b border-bloomberg-border px-3 py-2 text-left transition-colors duration-100 last:border-b-0 ${
            activeIndex === index ? 'bg-bloomberg-surface' : 'bg-black hover:bg-bloomberg-surface'
          }`}
        >
          <span className="truncate font-mono text-[11px] font-bold text-bloomberg-orange">
            {normalizeTickerSymbol(item.symbol)}
          </span>
          <span className="truncate font-mono text-[11px] text-bloomberg-white">
            {tickerName(item)}
          </span>
          <span className="truncate border border-bloomberg-border px-1.5 py-0.5 text-center font-mono text-[9px] uppercase text-bloomberg-muted">
            {tickerExchangeLabel(item)}
          </span>
          <span className="truncate text-right font-mono text-[10px] uppercase text-bloomberg-muted">
            {tickerMarket(item)}
          </span>
        </button>
      ))}
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="relative w-full overflow-visible">
      <div
        className={
          bare
            ? `flex items-center bg-transparent ${disabled ? 'opacity-50' : ''}`
            : `flex items-center border bg-black transition-colors duration-150 ${
                open
                  ? 'border-bloomberg-orange'
                  : 'border-bloomberg-border focus-within:border-bloomberg-orange'
              } ${disabled ? 'opacity-50' : ''}`
        }
      >
        {!bare && (
          <Search
            className="ml-2.5 mr-2 h-3.5 w-3.5 shrink-0 text-bloomberg-muted"
            aria-hidden="true"
          />
        )}
        <Input
          type="text"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className={
            bare
              ? 'h-9 w-full border-0 bg-transparent px-0 font-mono text-xs uppercase tracking-wider shadow-none placeholder:text-bloomberg-muted placeholder:normal-case focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed'
              : 'h-10 border-0 bg-black pl-1 pr-2.5 font-mono text-xs tracking-wider shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed'
          }
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
  placeholder: PropTypes.string,
  bare: PropTypes.bool,
  onSubmit: PropTypes.func,
};
