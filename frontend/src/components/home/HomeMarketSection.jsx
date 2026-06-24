import React, { useMemo } from 'react';

import { useWatchlistQuotes } from '../../hooks/useWatchlistQuotes';
import {
  MARKET_CATEGORIES,
  MARKET_CATEGORY_LABELS,
  MARKET_PRESETS,
} from '../../utils/marketDefaults';
import {
  formatChangePercent,
  formatLastPrice,
  normalizeWatchlistSymbol,
} from '../../utils/watchlistFormatters';

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chgNumber(quote) {
  const n = parseFloat(String(quote?.chg ?? '').replace(/[%+]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// One random instrument per asset class (equities, fx, commodities, fixed
// income, crypto). Reshuffles on every page load (mount); no refresh button.
export default function HomeMarketSection() {
  const picks = useMemo(
    () =>
      MARKET_CATEGORIES.map((category) => ({ category, ...pickRandom(MARKET_PRESETS[category]) })),
    []
  );
  const symbols = useMemo(() => picks.map((p) => p.symbol), [picks]);
  const { quotesBySymbol } = useWatchlistQuotes(symbols);

  return (
    <section className="shrink-0 border-t border-bloomberg-border">
      <div className="border-b border-bloomberg-border bg-bloomberg-card px-2 py-1.5">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-bloomberg-orange">
          Market
        </h2>
      </div>
      <div>
        {picks.map((p) => {
          const quote = quotesBySymbol.get(normalizeWatchlistSymbol(p.symbol));
          const chg = chgNumber(quote);
          const positive = chg == null ? null : chg >= 0;
          return (
            <div
              key={p.symbol}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-bloomberg-border px-2 py-1.5 text-[11px] last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate font-bold text-bloomberg-orange">{p.label}</span>
                <span className="block text-[9px] uppercase tracking-wider text-bloomberg-muted">
                  {MARKET_CATEGORY_LABELS[p.category]}
                </span>
              </span>
              <span className="text-right font-bold text-bloomberg-white">
                {formatLastPrice(quote?.price)}
              </span>
              <span
                className={`text-right font-bold ${
                  positive == null
                    ? 'text-bloomberg-muted'
                    : positive
                      ? 'text-bloomberg-green'
                      : 'text-bloomberg-red'
                }`}
              >
                {formatChangePercent(quote?.chg)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
