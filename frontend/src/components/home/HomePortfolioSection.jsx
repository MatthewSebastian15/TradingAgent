import React, { useMemo } from 'react';

import { useHoldingsStore } from '../../hooks/useHoldingsStore';
import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';
import {
  formatLastPrice,
  normalizeWatchlistSymbol,
} from '../../utils/watchlistFormatters';

function plPercent(price, costBasis) {
  if (!Number.isFinite(price) || !Number.isFinite(costBasis) || costBasis <= 0) return null;
  return ((price - costBasis) / costBasis) * 100;
}

// Compact read-only view of the user's holdings (Portfolio > My Holdings).
export default function HomePortfolioSection() {
  const { holdings } = useHoldingsStore();
  const symbols = useMemo(
    () => holdings.map((h) => normalizeWatchlistSymbol(h.ticker)).filter(Boolean),
    [holdings]
  );
  const { quotesBySymbol } = useWatchlistQuotes(symbols);

  return (
    <section className="shrink-0 border-t border-bloomberg-border">
      <div className="border-b border-bloomberg-border bg-bloomberg-card px-2 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-bloomberg-orange">
          Portfolio
        </h2>
      </div>
      {holdings.length === 0 ? (
        <div className="px-2 py-3 text-[11px] text-bloomberg-muted">
          No holdings yet. Add them on the Portfolio tab.
        </div>
      ) : (
        <div className="max-h-40 overflow-y-auto">
          {holdings.map((holding) => {
            const quote = quotesBySymbol.get(normalizeWatchlistSymbol(holding.ticker));
            const price = Number(quote?.price);
            const pl = plPercent(price, holding.cost_basis);
            return (
              <div
                key={holding.id}
                className="grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] items-center gap-2 border-b border-bloomberg-border px-2 py-1.5 text-[11px] last:border-b-0"
              >
                <span className="truncate font-bold text-bloomberg-orange">{holding.ticker}</span>
                <span className="truncate text-[9px] uppercase tracking-wider text-bloomberg-muted">
                  {holding.shares} sh
                </span>
                <span className="text-right font-bold text-bloomberg-white">
                  {formatLastPrice(quote?.price)}
                </span>
                <span
                  className={`text-right font-bold ${
                    pl == null
                      ? 'text-bloomberg-muted'
                      : pl >= 0
                        ? 'text-bloomberg-green'
                        : 'text-bloomberg-red'
                  }`}
                >
                  {pl == null ? '-' : `${pl >= 0 ? '+' : ''}${pl.toFixed(2)}%`}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
