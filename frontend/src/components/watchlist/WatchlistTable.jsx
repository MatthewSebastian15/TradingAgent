import { Trash2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React from 'react';

import WatchlistTrendBars from './WatchlistTrendBars';
import {
  formatChangePercent,
  formatLastPrice,
  formatVolume,
} from '../../utils/watchlistFormatters';

function quoteForSymbol(quotesBySymbol, symbol) {
  if (quotesBySymbol instanceof Map) return quotesBySymbol.get(symbol);
  return quotesBySymbol?.[symbol];
}

function trendForSymbol(trendsBySymbol, symbol) {
  if (trendsBySymbol instanceof Map) return trendsBySymbol.get(symbol);
  return trendsBySymbol?.[symbol];
}

export default function WatchlistTable({
  items,
  quotesBySymbol,
  trendsBySymbol,
  loading,
  onDeleteTicker,
}) {
  if (!items.length) {
    return (
      <div className="border border-bloomberg-border bg-bloomberg-card px-4 py-5 font-mono text-xs text-bloomberg-muted">
        <div className="font-bold uppercase tracking-[0.16em] text-bloomberg-white">
          No ticker in this group yet.
        </div>
        <div className="mt-2">Search a ticker above and click ADD.</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-bloomberg-border bg-black font-mono">
      <div className="grid h-9 grid-cols-[minmax(120px,1.4fr)_minmax(90px,0.8fr)_minmax(86px,0.7fr)_minmax(86px,0.7fr)_112px_44px] items-center border-b border-bloomberg-border bg-bloomberg-card px-3 text-[10px] font-bold uppercase tracking-[0.16em] text-bloomberg-muted">
        <div>Ticker</div>
        <div className="text-right">Last</div>
        <div className="text-right">Chg%</div>
        <div className="text-right">Vol</div>
        <div className="text-center">Trend</div>
        <div aria-label="Delete column" />
      </div>

      {items.map((item) => {
        const quote = quoteForSymbol(quotesBySymbol, item.symbol);
        const trend = trendForSymbol(trendsBySymbol, item.symbol) || [];
        const positive =
          quote?.pos ?? (trend.length > 1 ? trend[trend.length - 1] >= trend[0] : true);

        return (
          <div
            key={item.symbol}
            className="grid h-11 grid-cols-[minmax(120px,1.4fr)_minmax(90px,0.8fr)_minmax(86px,0.7fr)_minmax(86px,0.7fr)_112px_44px] items-center border-b border-bloomberg-border px-3 text-xs last:border-b-0 hover:bg-bloomberg-surface/70"
          >
            <div className="min-w-0">
              <div className="truncate font-bold text-bloomberg-orange">{item.symbol}</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-bloomberg-muted">
                {item.exchange || item.market || item.type || '-'}
              </div>
            </div>
            <div className="text-right font-bold text-bloomberg-white">
              {loading && !quote ? '-' : formatLastPrice(quote?.price)}
            </div>
            <div
              className={`text-right font-bold ${
                quote?.error || !quote
                  ? 'text-bloomberg-muted'
                  : positive
                    ? 'text-bloomberg-green'
                    : 'text-bloomberg-red'
              }`}
            >
              {loading && !quote ? '-' : formatChangePercent(quote?.chg)}
            </div>
            <div className="text-right text-bloomberg-white">{formatVolume(quote?.volume)}</div>
            <div className="flex justify-center">
              <WatchlistTrendBars values={trend} positive={positive} />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                aria-label={`Delete ${item.symbol}`}
                onClick={() => onDeleteTicker(item.symbol)}
                className="flex h-8 w-8 items-center justify-center text-bloomberg-muted hover:bg-bloomberg-red/10 hover:text-bloomberg-red"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

WatchlistTable.propTypes = {
  items: PropTypes.arrayOf(
    PropTypes.shape({
      symbol: PropTypes.string.isRequired,
      name: PropTypes.string,
      exchange: PropTypes.string,
      market: PropTypes.string,
      type: PropTypes.string,
    })
  ).isRequired,
  quotesBySymbol: PropTypes.oneOfType([PropTypes.instanceOf(Map), PropTypes.object]).isRequired,
  trendsBySymbol: PropTypes.oneOfType([PropTypes.instanceOf(Map), PropTypes.object]).isRequired,
  loading: PropTypes.bool,
  onDeleteTicker: PropTypes.func.isRequired,
};
