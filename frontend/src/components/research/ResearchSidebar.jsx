import { ChevronLeft, ChevronRight } from 'lucide-react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { WATCHLIST_PATH } from '../../constants/routes';
import { SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_EXPANDED_WIDTH } from '../../constants/sidebar';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';
import { readRecentTickers } from '../../utils/recentTickers';

function TickerRow({ item, active, onSelect }) {
  const exchange = String(item.exchange || '').trim();
  const label = exchange ? `${item.symbol}-${exchange}` : item.symbol;
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={`flex h-9 w-full items-center border-b border-[#1a1a1a] border-l-2 px-4 text-left font-mono text-[13px] ${
        active
          ? 'border-l-bloomberg-orange text-bloomberg-orange'
          : 'border-l-transparent text-bloomberg-white hover:text-bloomberg-orange'
      }`}
    >
      {label}
    </button>
  );
}
TickerRow.propTypes = {
  item: PropTypes.shape({
    symbol: PropTypes.string.isRequired,
    exchange: PropTypes.string,
  }).isRequired,
  active: PropTypes.bool,
  onSelect: PropTypes.func.isRequired,
};

// Left panel: RECENT (localStorage) + WATCHLIST (shared store) tabs.
// Re-reads recent on each render; parent re-renders on ticker change.
export default function ResearchSidebar({ activeTicker, collapsed, onToggle, onSelect }) {
  const [tab, setTab] = useState('RECENT');
  const { activeGroup } = useWatchlistStore();

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-label="Expand sidebar"
        className={`flex h-full ${SIDEBAR_COLLAPSED_WIDTH} shrink-0 items-center justify-center border-r border-bloomberg-border bg-[#111111] text-bloomberg-orange transition-all duration-200 ease-in-out`}
      >
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  }

  const recent = readRecentTickers({ limit: 5 });
  const watchlist = activeGroup?.items || [];
  const rows = tab === 'RECENT' ? recent : watchlist;

  return (
    <aside
      className={`flex h-full ${SIDEBAR_EXPANDED_WIDTH} shrink-0 flex-col border-r border-bloomberg-border bg-[#111111] transition-all duration-200 ease-in-out`}
    >
      <div className="flex h-10 shrink-0 border-b border-bloomberg-border">
        {['RECENT', 'WATCHLIST'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              tab === t
                ? 'text-bloomberg-orange'
                : 'text-bloomberg-muted hover:text-bloomberg-white'
            }`}
          >
            {t}
          </button>
        ))}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Collapse sidebar"
          className="flex w-7 shrink-0 items-center justify-center border-l border-bloomberg-border text-bloomberg-orange"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden">
        {rows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center font-mono">
            {tab === 'RECENT' ? (
              <>
                <div className="text-[11px] text-bloomberg-white/60">No recent tickers yet</div>
                <div className="text-[10px] text-bloomberg-white/60">
                  Search a ticker above to start.
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-bloomberg-white/60">Watchlist is empty</div>
                <div className="text-[10px] text-bloomberg-white/60">
                  Add a ticker from Overview, or open{' '}
                  <Link to={WATCHLIST_PATH} className="text-bloomberg-orange hover:underline">
                    Watchlist
                  </Link>
                  .
                </div>
              </>
            )}
          </div>
        ) : (
          rows.map((item) => (
            <TickerRow
              key={item.symbol}
              item={item}
              active={item.symbol === activeTicker}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}

ResearchSidebar.propTypes = {
  activeTicker: PropTypes.string,
  collapsed: PropTypes.bool,
  onToggle: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};
