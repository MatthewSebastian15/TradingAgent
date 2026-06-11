import React from 'react';
import { EMPTY_CHANGE, fallbackTickerQuotes, useTickerQuotes } from '../hooks/useTickerQuotes';
import { formatTickerLabel } from '../utils/formatting';

const TICKER_GROUP_MIN_ITEMS = 24;

function repeatToMinLength(items, minLength) {
  if (!items.length) return [];

  const repeats = Math.max(1, Math.ceil(minLength / items.length));
  return Array.from({ length: repeats }, () => items).flat();
}

export default function TickerTape() {
  const { quotes, fetchError } = useTickerQuotes();
  const items = repeatToMinLength(
    quotes.length > 0 ? quotes : fallbackTickerQuotes(),
    TICKER_GROUP_MIN_ITEMS
  );

  return (
    <div className="border-b border-bloomberg-border bg-black overflow-hidden">
      {fetchError && (
        <div className="font-mono text-xs text-bloomberg-amber text-center py-0.5 bg-bloomberg-surface">
          MARKET DATA UNAVAILABLE - backend offline or yfinance error
        </div>
      )}

      <div className="ticker-tape py-1.5" aria-label="Market ticker tape">
        <div className="ticker-tape__track">
          {[0, 1].map((group) => (
            <div key={group} className="ticker-tape__group" aria-hidden={group === 1}>
              {items.map((ticker, index) => {
                const isLoading = ticker.chg === EMPTY_CHANGE;

                return (
                  <span
                    key={`${group}-${ticker.sym}-${index}`}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    <span className="text-bloomberg-white font-semibold tracking-wider">
                      {formatTickerLabel(ticker.sym)}
                    </span>
                    <span
                      className={
                        isLoading
                          ? 'text-bloomberg-muted'
                          : ticker.pos
                            ? 'text-bloomberg-green'
                            : 'text-bloomberg-red'
                      }
                    >
                      {isLoading ? EMPTY_CHANGE : ticker.chg}
                    </span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
