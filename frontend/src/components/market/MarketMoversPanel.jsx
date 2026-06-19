import { RefreshCw, Search } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

import MarketMoversTable from './MarketMoversTable';
import { MARKET_EXCHANGE_PRESETS, MARKET_MOVERS_LIMIT } from '../../utils/marketDefaults';

function formatMarketOption(option) {
  return `${option.exchange} - ${option.country}`;
}

function findBestMarketOption(query) {
  const value = String(query || '')
    .trim()
    .toLowerCase();
  if (!value) return MARKET_EXCHANGE_PRESETS[0];

  return (
    MARKET_EXCHANGE_PRESETS.find((option) => formatMarketOption(option).toLowerCase() === value) ||
    MARKET_EXCHANGE_PRESETS.find((option) => option.exchange.toLowerCase() === value) ||
    MARKET_EXCHANGE_PRESETS.find((option) => option.country.toLowerCase() === value) ||
    MARKET_EXCHANGE_PRESETS.find((option) =>
      formatMarketOption(option).toLowerCase().includes(value)
    )
  );
}

export default function MarketMoversPanel({ movers }) {
  const initialSearch = formatMarketOption({ country: movers.country, exchange: movers.exchange });
  const [searchText, setSearchText] = useState(initialSearch);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectionError, setSelectionError] = useState('');

  const matches = useMemo(() => {
    const value = searchText.trim().toLowerCase();
    const source = value
      ? MARKET_EXCHANGE_PRESETS.filter((option) => {
          const label = formatMarketOption(option).toLowerCase();
          return (
            label.includes(value) ||
            option.country.toLowerCase().includes(value) ||
            option.exchange.toLowerCase().includes(value)
          );
        })
      : MARKET_EXCHANGE_PRESETS;

    return source.slice(0, 8);
  }, [searchText]);

  function selectMarket(option) {
    setSearchText(formatMarketOption(option));
    setSelectionError('');
    setSearchOpen(false);
    movers.setCountry(option.country);
    movers.setExchange(option.exchange);
  }

  function refreshMarketMovers() {
    const option = findBestMarketOption(searchText);
    if (!option) {
      setSelectionError('Select a valid exchange or country from the list.');
      return;
    }

    selectMarket(option);
    movers.refresh({
      country: option.country,
      exchange: option.exchange,
      limit: MARKET_MOVERS_LIMIT,
    });
  }

  return (
    <section className="grid gap-2 font-mono">
      <Card className="overflow-visible rounded-lg border-bloomberg-border bg-black/35 text-bloomberg-white shadow-lg shadow-black/20">
        <CardContent className="flex flex-col gap-2 p-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-md bg-bloomberg-orange px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
              Market Movers
            </span>
            <span className="truncate text-[10px] uppercase tracking-widest text-bloomberg-muted">
              {movers.exchange} · {movers.country}
            </span>
          </div>

          <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:w-[34rem]">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bloomberg-muted" />
              <Input
                value={searchText}
                onChange={(event) => {
                  setSearchText(event.target.value);
                  setSelectionError('');
                  setSearchOpen(true);
                }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') refreshMarketMovers();
                  if (event.key === 'Escape') setSearchOpen(false);
                }}
                placeholder="NASDAQ - United States"
                aria-label="Search exchange or country"
                className="h-8 rounded-md border-bloomberg-border bg-black/55 pl-8 font-mono text-[11px] uppercase tracking-wider text-bloomberg-white focus-visible:ring-bloomberg-orange"
              />

              {searchOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-56 overflow-hidden rounded-md border border-bloomberg-border bg-black shadow-xl shadow-black/50">
                  {matches.length > 0 ? (
                    <div className="max-h-56 overflow-y-auto py-1">
                      {matches.map((option) => (
                        <button
                          key={`${option.exchange}-${option.country}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectMarket(option)}
                          className="flex w-full items-center justify-between gap-3 px-2.5 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-bloomberg-white hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
                        >
                          <span className="truncate">{formatMarketOption(option)}</span>
                          <span className="text-bloomberg-muted">{option.countryCode}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-2.5 py-1.5 text-[10px] normal-case tracking-normal text-bloomberg-muted">
                      No matching exchange or country.
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button
              type="button"
              onClick={refreshMarketMovers}
              className="h-8 shrink-0 rounded-md bg-bloomberg-orange px-3 font-mono text-[11px] font-bold text-black hover:bg-bloomberg-orange/90 sm:w-28"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              REFRESH
            </Button>
          </div>
        </CardContent>

        {(selectionError || movers.error) && (
          <div className="flex items-center justify-between gap-3 border-t border-bloomberg-border bg-bloomberg-red/10 px-2 py-1.5 text-[10px] text-bloomberg-red">
            <span>{selectionError || movers.error}</span>
            {!selectionError && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshMarketMovers}
                className="h-6 rounded-md border-bloomberg-red/50 bg-black/40 px-2 font-mono text-[10px] text-bloomberg-red hover:bg-bloomberg-red/10 hover:text-bloomberg-red"
              >
                RETRY
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-2 lg:grid-cols-2">
        <MarketMoversTable
          title="Top Gainers"
          items={movers.data?.gainers || []}
          loading={movers.loading}
          limit={MARKET_MOVERS_LIMIT}
          emptyText="No valid market movers found for selected country/exchange."
          tone="positive"
        />
        <MarketMoversTable
          title="Top Losers"
          items={movers.data?.losers || []}
          loading={movers.loading}
          limit={MARKET_MOVERS_LIMIT}
          emptyText="No valid market movers found for selected country/exchange."
          tone="negative"
        />
      </div>
    </section>
  );
}

MarketMoversPanel.propTypes = {
  movers: PropTypes.shape({
    country: PropTypes.string.isRequired,
    setCountry: PropTypes.func.isRequired,
    exchange: PropTypes.string.isRequired,
    setExchange: PropTypes.func.isRequired,
    data: PropTypes.shape({
      gainers: PropTypes.array,
      losers: PropTypes.array,
    }),
    loading: PropTypes.bool.isRequired,
    error: PropTypes.string,
    refresh: PropTypes.func.isRequired,
  }).isRequired,
};
