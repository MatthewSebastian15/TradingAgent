import React from 'react';
import { EMPTY_CHANGE, fallbackTickerQuotes, useTickerQuotes } from '../hooks/useTickerQuotes';

function formatTickerPrice(ticker) {
  const value = Number(ticker.price);
  if (!Number.isFinite(value)) return EMPTY_CHANGE;

  const symbol = String(ticker.sym || '').toUpperCase();
  const formattedValue = symbol === '^TNX' ? value / 10 : value;

  if (symbol === '^TNX') {
    return `${formattedValue.toFixed(2)}%`;
  }

  if (Math.abs(formattedValue) >= 1000) {
    return Intl.NumberFormat(undefined, {
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(formattedValue);
  }

  return formattedValue.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TickerTape() {
  const { quotes, fetchError } = useTickerQuotes();
  const items = (quotes.length > 0 ? quotes : fallbackTickerQuotes()).slice(0, 10);

  return (
    <div className="sticky top-10 z-40 border-b border-bloomberg-border bg-black overflow-hidden">
      {fetchError && (
        <div className="font-mono text-xs text-bloomberg-amber text-center py-0.5 bg-bloomberg-surface">
          MARKET DATA UNAVAILABLE - backend offline or yfinance error
        </div>
      )}

      <div className="ticker-tape" aria-label="Global market ticker tape">
        {items.map((ticker) => {
          const isLoading = ticker.chg === EMPTY_CHANGE;

          return (
            <div key={ticker.sym} className="ticker-tape__item">
              <span className="ticker-tape__label">{ticker.label || ticker.sym}</span>
              <span className="ticker-tape__price">{formatTickerPrice(ticker)}</span>
              <span
                className={
                  isLoading
                    ? 'ticker-tape__change text-bloomberg-muted'
                    : ticker.pos
                      ? 'ticker-tape__change text-bloomberg-green'
                      : 'ticker-tape__change text-bloomberg-red'
                }
              >
                {isLoading ? EMPTY_CHANGE : ticker.chg}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
