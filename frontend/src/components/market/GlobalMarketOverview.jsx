import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Plus, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import MarketCategoryTabs from './MarketCategoryTabs';
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
  onChangeCategory,
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const itemsBySymbol = useMemo(
    () => new Map((data?.items || []).map((item) => [item.symbol, item])),
    [data]
  );
  const items = symbols.map((symbol) => itemsBySymbol.get(symbol) || fallbackItem(symbol, loading));
  const showLimitNotice = notice || symbols.length >= MARKET_MAX_SYMBOLS || !canDelete;
  const limitText =
    notice ||
    (symbols.length >= MARKET_MAX_SYMBOLS
      ? 'Maximum 6 instruments'
      : 'Minimum 3 instruments required');

  return (
    <Card className="overflow-hidden rounded-xl border-bloomberg-border bg-black/40 font-mono text-bloomberg-white shadow-lg shadow-black/20">
      <CardHeader className="flex flex-col gap-3 border-b border-bloomberg-border bg-bloomberg-surface/50 p-3 lg:flex-row lg:items-center lg:justify-between">
        <CardTitle className="w-fit rounded-md bg-bloomberg-orange px-3 py-1.5 font-mono text-[11px] font-bold uppercase tracking-widest text-black">
          Global Markets Overview
        </CardTitle>
        <MarketCategoryTabs activeCategory={activeCategory} onChangeCategory={onChangeCategory} />
      </CardHeader>

      <div className="flex flex-col gap-2 border-b border-bloomberg-border bg-bloomberg-surface/40 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-h-5 text-[11px] text-bloomberg-muted">
          {showLimitNotice && (
            <>
              <Badge
                variant="outline"
                className="mr-2 rounded-full border-bloomberg-border bg-black/60 px-2 py-0 font-mono text-[9px] text-bloomberg-amber"
              >
                LIMIT
              </Badge>
              {limitText}
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            className="h-8 rounded-md border-bloomberg-border bg-black/60 px-3 font-mono text-[11px] font-bold text-bloomberg-amber hover:border-bloomberg-orange hover:bg-bloomberg-orange/10 hover:text-bloomberg-orange"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            REFRESH
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canAdd}
            onClick={() => setPickerOpen(true)}
            className={`h-8 rounded-md px-3 font-mono text-[11px] font-bold ${
              canAdd
                ? 'bg-bloomberg-orange text-black hover:bg-bloomberg-orange/90'
                : 'cursor-not-allowed border border-bloomberg-border bg-black text-bloomberg-subtle'
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            ADD MARKET
          </Button>
        </div>
      </div>

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
  }),
  loading: PropTypes.bool.isRequired,
  error: PropTypes.string,
  notice: PropTypes.string,
  canAdd: PropTypes.bool.isRequired,
  canDelete: PropTypes.bool.isRequired,
  onAddSymbol: PropTypes.func.isRequired,
  onDeleteSymbol: PropTypes.func.isRequired,
  onRefresh: PropTypes.func.isRequired,
  onChangeCategory: PropTypes.func.isRequired,
};

GlobalMarketOverview.defaultProps = {
  data: { items: [] },
  error: '',
  notice: '',
};
