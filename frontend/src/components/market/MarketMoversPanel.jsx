import React from 'react';
import PropTypes from 'prop-types';
import MarketMoversTable from './MarketMoversTable';
import { MARKET_EXCHANGE_PRESETS, MARKET_LIMIT_OPTIONS } from '../../utils/marketDefaults';

export default function MarketMoversPanel({ movers }) {
  const countries = Array.from(new Set(MARKET_EXCHANGE_PRESETS.map((item) => item.country)));
  const exchanges = Array.from(new Set(MARKET_EXCHANGE_PRESETS.map((item) => item.exchange)));

  return (
    <section className="grid gap-3 font-mono">
      <div className="border border-bloomberg-border bg-black">
        <div className="bg-bloomberg-orange px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black">
          Market Movers
        </div>
        <div className="grid gap-2 p-3 md:grid-cols-[1fr_1fr_8rem_8rem]">
          <label className="grid gap-1 text-[10px] uppercase tracking-widest text-bloomberg-muted">
            Country
            <input
              list="market-country-options"
              value={movers.country}
              onChange={(event) => movers.setCountry(event.target.value)}
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs uppercase text-bloomberg-white outline-none focus:border-bloomberg-orange"
            />
          </label>
          <label className="grid gap-1 text-[10px] uppercase tracking-widest text-bloomberg-muted">
            Exchange
            <input
              list="market-exchange-options"
              value={movers.exchange}
              onChange={(event) => movers.setExchange(event.target.value)}
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs uppercase text-bloomberg-white outline-none focus:border-bloomberg-orange"
            />
          </label>
          <label className="grid gap-1 text-[10px] uppercase tracking-widest text-bloomberg-muted">
            Limit
            <select
              value={movers.limit}
              onChange={(event) => movers.setLimit(Number(event.target.value))}
              className="border border-bloomberg-border bg-black px-3 py-2 text-xs text-bloomberg-white outline-none focus:border-bloomberg-orange"
            >
              {MARKET_LIMIT_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={movers.refresh}
            className="self-end border border-bloomberg-orange bg-bloomberg-orange px-3 py-2 text-xs font-bold text-black"
          >
            REFRESH
          </button>
        </div>

        <datalist id="market-country-options">
          {countries.map((country) => (
            <option key={country} value={country} />
          ))}
        </datalist>
        <datalist id="market-exchange-options">
          {exchanges.map((exchange) => (
            <option key={exchange} value={exchange} />
          ))}
        </datalist>

        {movers.error && (
          <div className="flex items-center justify-between gap-3 border-t border-bloomberg-border px-3 py-2 text-[11px] text-bloomberg-red">
            <span>{movers.error}</span>
            <button
              type="button"
              onClick={movers.refresh}
              className="border border-bloomberg-red px-2 py-1 text-bloomberg-red"
            >
              RETRY
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <MarketMoversTable
          title="Top Gainers"
          items={movers.data?.gainers || []}
          loading={movers.loading}
          limit={Number(movers.limit)}
          emptyText="No valid market movers found for selected country/exchange."
          tone="positive"
        />
        <MarketMoversTable
          title="Top Losers"
          items={movers.data?.losers || []}
          loading={movers.loading}
          limit={Number(movers.limit)}
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
    limit: PropTypes.number.isRequired,
    setLimit: PropTypes.func.isRequired,
    data: PropTypes.shape({
      gainers: PropTypes.array,
      losers: PropTypes.array,
    }),
    loading: PropTypes.bool.isRequired,
    error: PropTypes.string,
    refresh: PropTypes.func.isRequired,
  }).isRequired,
};
