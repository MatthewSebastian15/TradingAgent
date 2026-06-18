import React from 'react';

import WarningToastStack from './WarningToastStack';
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
  const warnings = fetchError
    ? [
        {
          id: 'market-data-unavailable',
          title: 'MARKET DATA UNAVAILABLE',
          message: 'Backend offline or yfinance error.',
        },
      ]
    : [];

  return (
    <>
      <WarningToastStack warnings={warnings} />
      <div className="sticky top-7 z-40 border-b border-bloomberg-border bg-black overflow-hidden">
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
    </>
  );
}
