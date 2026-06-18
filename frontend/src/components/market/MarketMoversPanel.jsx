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
    <section className="grid gap-3 font-mono">
      <Card className="overflow-visible rounded-xl border-bloomberg-border bg-black/40 text-bloomberg-white shadow-lg shadow-black/20">
        <CardContent className="grid gap-2 p-3 md:grid-cols-[minmax(0,1fr)_8rem] md:items-end">
          <label className="relative grid gap-1 text-[10px] uppercase tracking-widest text-bloomberg-muted">
            Search exchange or country
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-bloomberg-muted" />
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
                className="h-10 rounded-md border-bloomberg-border bg-black/60 pl-9 font-mono text-xs uppercase text-bloomberg-white focus-visible:ring-bloomberg-orange"
              />

              {searchOpen && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.25rem)] z-30 max-h-64 overflow-hidden rounded-md border border-bloomberg-border bg-black shadow-xl shadow-black/50">
                  {matches.length > 0 ? (
                    <div className="max-h-64 overflow-y-auto py-1">
                      {matches.map((option) => (
                        <button
                          key={`${option.exchange}-${option.country}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => selectMarket(option)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left font-mono text-[11px] uppercase tracking-wider text-bloomberg-white hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
                        >
                          <span>{formatMarketOption(option)}</span>
                          <span className="text-[10px] text-bloomberg-muted">
                            {option.countryCode}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="px-3 py-2 text-[11px] normal-case tracking-normal text-bloomberg-muted">
                      No matching exchange or country.
                    </div>
                  )}
                </div>
              )}
            </div>
          </label>

          <Button
            type="button"
            onClick={refreshMarketMovers}
            className="h-10 rounded-md bg-bloomberg-orange px-3 font-mono text-xs font-bold text-black hover:bg-bloomberg-orange/90"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            REFRESH
          </Button>
        </CardContent>

        {(selectionError || movers.error) && (
          <div className="flex items-center justify-between gap-3 border-t border-bloomberg-border bg-bloomberg-red/10 px-3 py-2 text-[11px] text-bloomberg-red">
            <span>{selectionError || movers.error}</span>
            {!selectionError && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={refreshMarketMovers}
                className="h-7 rounded-md border-bloomberg-red/50 bg-black/40 px-2 font-mono text-[10px] text-bloomberg-red hover:bg-bloomberg-red/10 hover:text-bloomberg-red"
              >
                RETRY
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
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
