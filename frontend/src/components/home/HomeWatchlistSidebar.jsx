import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { memo, useEffect, useMemo, useState } from 'react';

import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from '../../constants/sidebar';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';
import {
  formatChangePercent,
  formatLastPrice,
  formatVolume,
} from '../../utils/watchlistFormatters';
import WatchlistTrendBars from '../watchlist/WatchlistTrendBars';

const sortShape = PropTypes.shape({
  field: PropTypes.string.isRequired,
  dir: PropTypes.oneOf(['asc', 'desc']).isRequired,
});

const rowShape = PropTypes.shape({
  item: PropTypes.shape({
    symbol: PropTypes.string.isRequired,
    name: PropTypes.string,
    exchange: PropTypes.string,
    market: PropTypes.string,
    type: PropTypes.string,
  }).isRequired,
  quote: PropTypes.object,
  trend: PropTypes.arrayOf(PropTypes.number).isRequired,
});

// Backend quotes carry no status/exchange-time field, so we derive both from the
// live payload: status from the error/price flags, timestamp from snapshot arrival.
// ponytail: client receive time, swap to an exchange timestamp if the API adds one.
function quoteStatus(quote) {
  if (!quote) return { label: 'WAIT', tone: 'text-bloomberg-muted' };
  if (quote.error || quote.price == null) return { label: 'ERR', tone: 'text-bloomberg-red' };
  return { label: 'LIVE', tone: 'text-bloomberg-green' };
}

function chgNumber(quote) {
  const n = parseFloat(String(quote?.chg ?? '').replace(/[%+]/g, ''));
  return Number.isFinite(n) ? n : -Infinity;
}

const SORTERS = {
  sym: (a, b) => a.item.symbol.localeCompare(b.item.symbol),
  price: (a, b) => (a.quote?.price ?? -Infinity) - (b.quote?.price ?? -Infinity),
  chg: (a, b) => chgNumber(a.quote) - chgNumber(b.quote),
  volume: (a, b) => (a.quote?.volume ?? -Infinity) - (b.quote?.volume ?? -Infinity),
};

function SortHeader({ label, field, sort, onSort, className = '' }) {
  const active = sort.field === field;
  return (
    <button
      type="button"
      onClick={() => onSort(field)}
      className={`flex items-center gap-0.5 uppercase tracking-[0.12em] hover:text-bloomberg-white ${
        active ? 'text-bloomberg-orange' : ''
      } ${className}`}
    >
      {label}
      {active &&
        (sort.dir === 'asc' ? (
          <ArrowUp className="h-2.5 w-2.5" />
        ) : (
          <ArrowDown className="h-2.5 w-2.5" />
        ))}
    </button>
  );
}

SortHeader.propTypes = {
  label: PropTypes.string.isRequired,
  field: PropTypes.string.isRequired,
  sort: sortShape.isRequired,
  onSort: PropTypes.func.isRequired,
  className: PropTypes.string,
};

const Row = memo(function Row({ row, expanded, onToggle, timestamp }) {
  const { item, quote, trend } = row;
  const positive = quote?.pos ?? (trend.length > 1 ? trend[trend.length - 1] >= trend[0] : true);
  const status = quoteStatus(quote);

  return (
    <div className="border-b border-bloomberg-border last:border-b-0">
      <button
        type="button"
        onClick={() => onToggle(item.symbol)}
        aria-expanded={expanded}
        className="grid w-full grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_64px] items-center gap-1 px-2 py-1.5 text-left text-[11px] transition-colors hover:bg-bloomberg-surface/70"
      >
        <span className="min-w-0">
          <span className="block truncate font-bold text-bloomberg-orange">{item.symbol}</span>
          <span className={`block text-[9px] ${status.tone}`}>{status.label}</span>
        </span>
        <span className="text-right font-bold text-bloomberg-white">
          {formatLastPrice(quote?.price)}
        </span>
        <span
          className={`text-right font-bold ${
            !quote || quote.error
              ? 'text-bloomberg-muted'
              : positive
                ? 'text-bloomberg-green'
                : 'text-bloomberg-red'
          }`}
        >
          {formatChangePercent(quote?.chg)}
        </span>
        <span className="flex justify-end">
          <WatchlistTrendBars values={trend} positive={positive} width={56} height={20} />
        </span>
      </button>

      {expanded && (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 bg-bloomberg-bg px-2 pb-2 pt-1 text-[10px] text-bloomberg-muted">
          <div className="col-span-2 truncate text-bloomberg-white">{item.name || item.symbol}</div>
          <Detail label="Volume" value={formatVolume(quote?.volume)} />
          <Detail label="Status" value={status.label} valueClass={status.tone} />
          <Detail label="Exchange" value={item.exchange || item.market || item.type || '-'} />
          <Detail label="As of" value={timestamp || '-'} />
        </dl>
      )}
    </div>
  );
});

Row.propTypes = {
  row: rowShape.isRequired,
  expanded: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  timestamp: PropTypes.string,
};

function Detail({ label, value, valueClass = 'text-bloomberg-white' }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="uppercase tracking-wider">{label}</dt>
      <dd className={`font-bold ${valueClass}`}>{value}</dd>
    </div>
  );
}

Detail.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.node,
  valueClass: PropTypes.string,
};

function Skeleton() {
  return (
    <div aria-label="Loading watchlist" role="status" className="divide-y divide-bloomberg-border">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-2 px-2 py-2">
          <div className="h-3 w-16 animate-pulse rounded bg-bloomberg-surface" />
          <div className="h-3 w-10 animate-pulse rounded bg-bloomberg-surface" />
          <div className="h-3 w-12 animate-pulse rounded bg-bloomberg-surface" />
        </div>
      ))}
    </div>
  );
}

export default function HomeWatchlistSidebar({ collapsed = false, onToggle = () => {} }) {
  const { activeGroup } = useWatchlistStore();
  const symbols = useMemo(
    () => (activeGroup?.items || []).map((item) => item.symbol),
    [activeGroup]
  );
  const { quotesBySymbol, trendsBySymbol, loadingQuotes, error } = useWatchlistQuotes(symbols);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: 'sym', dir: 'asc' });
  const [expanded, setExpanded] = useState(null);
  const [updatedAt, setUpdatedAt] = useState('');

  useEffect(() => {
    if (quotesBySymbol.size) setUpdatedAt(new Date().toLocaleTimeString());
  }, [quotesBySymbol]);

  const rows = useMemo(() => {
    const items = activeGroup?.items || [];
    const q = query.trim().toUpperCase();
    const built = items
      .filter(
        (item) =>
          !q ||
          item.symbol.includes(q) ||
          String(item.name || '')
            .toUpperCase()
            .includes(q)
      )
      .map((item) => ({
        item,
        quote: quotesBySymbol.get(item.symbol),
        trend: trendsBySymbol.get(item.symbol) || [],
      }));
    const sorted = built.sort(SORTERS[sort.field]);
    if (sort.dir === 'desc') sorted.reverse();
    return sorted;
  }, [activeGroup, query, quotesBySymbol, trendsBySymbol, sort]);

  function onSort(field) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { field, dir: field === 'sym' ? 'asc' : 'desc' }
    );
  }

  const totalSymbols = (activeGroup?.items || []).length;
  const showSkeleton = loadingQuotes && quotesBySymbol.size === 0 && totalSymbols > 0;

  // Pinned to the viewport's top (below navbar), bottom, and right edges.
  const anchor = 'fixed right-0 top-[60px] bottom-0 z-30 transition-[width] duration-150';

  if (collapsed) {
    return (
      <aside
        className={`${anchor} flex ${SIDEBAR_COLLAPSED_WIDTH} flex-col border-l border-bloomberg-border bg-black`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label="Expand watchlist"
          className="flex h-full w-full items-center justify-center text-bloomberg-orange"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      className={`${anchor} flex ${SIDEBAR_EXPANDED_WIDTH} flex-col border-l border-bloomberg-border bg-black font-mono text-bloomberg-white`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-bloomberg-border bg-bloomberg-card px-2 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-bloomberg-orange">
          Watchlist
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-bloomberg-muted">
            {updatedAt ? `@ ${updatedAt}` : 'LIVE'}
          </span>
          <button
            type="button"
            onClick={onToggle}
            aria-label="Collapse watchlist"
            className="text-bloomberg-orange"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative border-b border-bloomberg-border">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-bloomberg-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search ticker..."
          aria-label="Search watchlist"
          className="w-full bg-transparent py-1.5 pl-7 pr-2 text-[11px] outline-none placeholder:text-bloomberg-muted"
        />
      </div>

      <div className="grid grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.7fr)_64px] gap-1 border-b border-bloomberg-border bg-bloomberg-card px-2 py-1 text-[9px] font-bold text-bloomberg-muted">
        <SortHeader label="Ticker" field="sym" sort={sort} onSort={onSort} />
        <SortHeader
          label="Last"
          field="price"
          sort={sort}
          onSort={onSort}
          className="justify-end"
        />
        <SortHeader label="Chg%" field="chg" sort={sort} onSort={onSort} className="justify-end" />
        <SortHeader
          label="Vol"
          field="volume"
          sort={sort}
          onSort={onSort}
          className="justify-end"
        />
      </div>

      <div className="max-h-[60vh] flex-1 overflow-y-auto md:max-h-none">
        {error ? (
          <div role="alert" className="px-2 py-4 text-[11px] text-bloomberg-red">
            {error}
          </div>
        ) : showSkeleton ? (
          <Skeleton />
        ) : totalSymbols === 0 ? (
          <div className="px-2 py-4 text-[11px] text-bloomberg-muted">
            No tickers yet. Add them on the Watchlist tab.
          </div>
        ) : rows.length === 0 ? (
          <div className="px-2 py-4 text-[11px] text-bloomberg-muted">No matches.</div>
        ) : (
          rows.map((row) => (
            <Row
              key={row.item.symbol}
              row={row}
              expanded={expanded === row.item.symbol}
              onToggle={(s) => setExpanded((cur) => (cur === s ? null : s))}
              timestamp={updatedAt}
            />
          ))
        )}
      </div>
    </aside>
  );
}

HomeWatchlistSidebar.propTypes = {
  collapsed: PropTypes.bool,
  onToggle: PropTypes.func,
};
