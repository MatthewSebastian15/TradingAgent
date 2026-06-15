import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import MarketOverviewCard from './MarketOverviewCard';
import MarketOverviewPicker from './MarketOverviewPicker';
import { MARKET_MAX_SYMBOLS, labelForMarketSymbol } from '../../utils/marketDefaults';

function gridColumnsClass(count) {
  if (count >= 6) return 'xl:grid-cols-6';
  if (count === 5) return 'xl:grid-cols-5';
  if (count === 4) return 'xl:grid-cols-4';
  return 'xl:grid-cols-3';
}

function fallbackItem(symbol, loading) {
  return {
    symbol,
    label: labelForMarketSymbol(symbol),
    status: 'unavailable',
    reason: loading ? 'LOADING...' : 'Market data unavailable',
    sparkline: [],
  };
}

export default function GlobalMarketOverview({
  activeCategory,
  symbols,
  data,
  loading,
  error,
  notice,
  canAdd,
  canDelete,
  onAddSymbol,
  onDeleteSymbol,
  onRefresh,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const itemsBySymbol = useMemo(
    () => new Map((data?.items || []).map((item) => [item.symbol, item])),
    [data]
  );
  const items = symbols.map((symbol) => itemsBySymbol.get(symbol) || fallbackItem(symbol, loading));

  return (
    <section className="border border-bloomberg-border bg-black font-mono">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-bloomberg-border">
        <div className="bg-bloomberg-orange px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-black">
          Global Markets Overview
        </div>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <button
            type="button"
            onClick={onRefresh}
            className="border border-bloomberg-border bg-black px-3 py-1.5 text-[11px] font-bold text-bloomberg-amber hover:border-bloomberg-orange hover:text-bloomberg-orange"
          >
            REFRESH
          </button>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() => setPickerOpen(true)}
            className={`border px-3 py-1.5 text-[11px] font-bold ${
              canAdd
                ? 'border-bloomberg-orange bg-bloomberg-orange text-black'
                : 'cursor-not-allowed border-bloomberg-border bg-black text-bloomberg-subtle'
            }`}
          >
            ADD MARKET
          </button>
        </div>
      </div>

      {(notice || symbols.length >= MARKET_MAX_SYMBOLS || !canDelete) && (
        <div className="border-b border-bloomberg-border px-3 py-1 text-[11px] text-bloomberg-muted">
          {notice ||
            (symbols.length >= MARKET_MAX_SYMBOLS
              ? 'Maximum 6 instruments'
              : 'Minimum 3 instruments required')}
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-bloomberg-border px-3 py-2 text-[11px] text-bloomberg-red">
          <span>{error}</span>
          <button
            type="button"
            onClick={onRefresh}
            className="border border-bloomberg-red px-2 py-1 text-bloomberg-red"
          >
            RETRY
          </button>
        </div>
      )}

      {data?.message && !error && (
        <div className="border-b border-bloomberg-border px-3 py-2 text-[11px] text-bloomberg-red">
          {data.message}
        </div>
      )}

      <div
        className={`grid grid-cols-1 gap-2 p-2 md:grid-cols-2 lg:grid-cols-3 ${gridColumnsClass(symbols.length)}`}
      >
        {items.map((item) => (
          <MarketOverviewCard
            key={item.symbol}
            item={item}
            canDelete={canDelete}
            onDelete={() => onDeleteSymbol(item.symbol)}
          />
        ))}
      </div>

      {pickerOpen && (
        <MarketOverviewPicker
          activeCategory={activeCategory}
          existingSymbols={symbols}
          onAddSymbol={onAddSymbol}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </section>
  );
}

GlobalMarketOverview.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  data: PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.object),
    message: PropTypes.string,
  }),
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  notice: PropTypes.string,
  canAdd: PropTypes.bool.isRequired,
  canDelete: PropTypes.bool.isRequired,
  onAddSymbol: PropTypes.func.isRequired,
  onDeleteSymbol: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
};

GlobalMarketOverview.defaultProps = {
  data: { items: [] },
  error: '',
  notice: '',
};
