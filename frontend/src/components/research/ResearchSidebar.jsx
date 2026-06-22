import PropTypes from 'prop-types';
import { useState } from 'react';

import { useWatchlistStore } from '../../hooks/useWatchlistStore';
import { readRecentTickers } from '../../utils/recentTickers';

function TickerRow({ symbol, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(symbol)}
      className="w-full border-b border-bloomberg-border px-3 py-1.5 text-left font-mono text-[11px] text-bloomberg-white hover:text-bloomberg-orange"
    >
      {symbol}
    </button>
  );
}
TickerRow.propTypes = { symbol: PropTypes.string.isRequired, onSelect: PropTypes.func.isRequired };

// Left panel: RECENT (localStorage) + WATCHLIST (shared store) tabs.
// Re-reads recent on each render; parent re-renders on ticker change.
export default function ResearchSidebar({ onSelect }) {
  const [tab, setTab] = useState('RECENT');
  const { activeGroup } = useWatchlistStore();

  const recent = readRecentTickers({ limit: 5 });
  const watchlist = activeGroup?.items || [];

  const tabs = ['RECENT', 'WATCHLIST'];
  const rows = tab === 'RECENT' ? recent : watchlist;

  return (
    <aside className="w-[180px] shrink-0 border-r border-bloomberg-border bg-[#111111]">
      <div className="flex">
        {tabs.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 border-b-2 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              tab === t
                ? 'border-bloomberg-orange text-bloomberg-orange'
                : 'border-transparent text-bloomberg-muted hover:text-bloomberg-white'
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <div>
        {rows.length === 0 ? (
          <p className="px-3 py-3 font-mono text-[10px] text-bloomberg-muted">
            {tab === 'RECENT' ? 'No recent tickers' : 'No watchlist tickers'}
          </p>
        ) : (
          rows.map((item) => (
            <TickerRow key={item.symbol} symbol={item.symbol} onSelect={onSelect} />
          ))
        )}
      </div>
    </aside>
  );
}

ResearchSidebar.propTypes = {
  onSelect: PropTypes.func.isRequired,
};
