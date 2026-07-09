import { Plus, RefreshCw } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import MarketCategoryTabs from './MarketCategoryTabs';
import MarketOverviewCard from './MarketOverviewCard';
import MarketOverviewPicker from './MarketOverviewPicker';
import { labelForMarketSymbol } from '../../utils/marketDefaults';

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

function formatMarketUpdatedAt(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function freshnessText(data) {
  const parts = [];
  if (data?.source) parts.push(String(data.source).toUpperCase());

  const updatedAt = formatMarketUpdatedAt(data?.last_updated);
  if (updatedAt) parts.push(`UPDATED ${updatedAt}`);

  if (data?.cache?.hit === true) parts.push('CACHE HIT');
  if (data?.cache?.hit === false) parts.push('FRESH');

  return parts.join(' | ');
}

export default function GlobalMarketOverview({
  activeCategory,
  symbols,
  data = { items: [] },
  loading,
  error = '',
  canAdd,
  canDelete,
  onAddSymbol,
  onDeleteSymbol,
  onRefresh,
  onChangeCategory,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const itemsBySymbol = useMemo(
    () => new Map((data?.items || []).map((item) => [item.symbol, item])),
    [data]
  );
  const items = symbols.map((symbol) => itemsBySymbol.get(symbol) || fallbackItem(symbol, loading));
  const freshness = freshnessText(data);

  return (
    <Card className="overflow-hidden rounded-lg border-bloomberg-border bg-black/45 font-mono text-bloomberg-white shadow-md shadow-black/20">
      <CardHeader className="border-b border-bloomberg-border bg-bloomberg-surface/50 px-3 py-2">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <CardTitle className="w-fit rounded bg-bloomberg-orange px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-black">
              Global Markets Overview
            </CardTitle>
            {freshness && (
              <div className="truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-bloomberg-muted">
                {freshness}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
            <MarketCategoryTabs
              activeCategory={activeCategory}
              onChangeCategory={onChangeCategory}
            />
            <div className="flex flex-wrap items-center gap-1.5 lg:justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                className="h-7 gap-1.5 rounded-md border-bloomberg-border bg-black/60 px-2.5 font-mono text-[10px] font-bold text-bloomberg-amber hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange [&_svg]:size-3.5"
              >
                <RefreshCw />
                REFRESH
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!canAdd}
                onClick={() => setPickerOpen(true)}
                className={`h-7 gap-1.5 rounded-md px-2.5 font-mono text-[10px] font-bold [&_svg]:size-3.5 ${
                  canAdd
                    ? 'bg-bloomberg-orange text-black hover:bg-bloomberg-orange/90'
                    : 'cursor-not-allowed border border-bloomberg-border bg-black text-bloomberg-subtle'
                }`}
              >
                <Plus />
                ADD MARKET
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>

      {error && (
        <div className="flex items-center justify-between gap-3 border-b border-bloomberg-border bg-bloomberg-red/10 px-3 py-2 text-[11px] text-bloomberg-red">
          <span>{error}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-7 rounded-md border-bloomberg-red/50 bg-black/40 px-2 font-mono text-[10px] text-bloomberg-red hover:bg-bloomberg-red/10 hover:text-bloomberg-red"
          >
            RETRY
          </Button>
        </div>
      )}

      {data?.message && !error && (
        <div className="border-b border-bloomberg-border bg-bloomberg-red/10 px-3 py-2 text-[11px] text-bloomberg-red">
          {data.message}
        </div>
      )}

      <CardContent
        className={`grid grid-cols-1 gap-2 p-2 md:grid-cols-2 lg:grid-cols-3 ${gridColumnsClass(symbols.length)}`}
      >
        {items.map((item) => (
          <MarketOverviewCard
            key={item.symbol}
            item={item}
            loading={loading}
            canDelete={canDelete}
            onDelete={() => onDeleteSymbol(item.symbol)}
          />
        ))}
      </CardContent>

      {pickerOpen && (
        <MarketOverviewPicker
          activeCategory={activeCategory}
          existingSymbols={symbols}
          onAddSymbol={onAddSymbol}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </Card>
  );
}

GlobalMarketOverview.propTypes = {
  activeCategory: PropTypes.string.isRequired,
  symbols: PropTypes.arrayOf(PropTypes.string).isRequired,
  data: PropTypes.shape({
    items: PropTypes.arrayOf(PropTypes.object),
    message: PropTypes.string,
    source: PropTypes.string,
    last_updated: PropTypes.string,
    cache: PropTypes.shape({
      hit: PropTypes.bool,
      ttl_seconds: PropTypes.number,
      force_refresh: PropTypes.bool,
    }),
  }),
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  canAdd: PropTypes.bool.isRequired,
  canDelete: PropTypes.bool.isRequired,
  onAddSymbol: PropTypes.func.isRequired,
  onDeleteSymbol: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onChangeCategory: PropTypes.func.isRequired,
};
