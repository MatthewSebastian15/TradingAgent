import React from 'react';
import GlobalMarketOverview from './GlobalMarketOverview';
import MarketCategoryTabs from './MarketCategoryTabs';
import MarketMoversPanel from './MarketMoversPanel';
import { useMarketMovers } from '../../hooks/useMarketMovers';
import { useMarketOverviewConfig } from '../../hooks/useMarketOverviewConfig';
import { useMarketOverviewData } from '../../hooks/useMarketOverviewData';

export default function MarketTab() {
  const overviewConfig = useMarketOverviewConfig();
  const overviewData = useMarketOverviewData(overviewConfig.symbols);
  const movers = useMarketMovers();

  function refreshAll() {
    overviewData.refresh();
    movers.refresh();
  }

  return (
    <main className="bg-black px-2 py-3 font-mono text-bloomberg-white sm:px-4">
      <div className="mb-3 flex flex-col gap-2 border border-bloomberg-border bg-black p-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-bloomberg-orange px-3 py-1.5 text-xs font-bold uppercase tracking-widest text-black">
            Global Markets Overview
          </div>
          <button
            type="button"
            onClick={refreshAll}
            className="border border-bloomberg-border px-3 py-1.5 text-[11px] font-bold text-bloomberg-amber hover:border-bloomberg-orange hover:text-bloomberg-orange"
          >
            REFRESH
          </button>
        </div>
        <MarketCategoryTabs
          activeCategory={overviewConfig.activeCategory}
          onChangeCategory={overviewConfig.changeCategory}
        />
      </div>

      <div className="grid gap-3">
        <GlobalMarketOverview
          activeCategory={overviewConfig.activeCategory}
          symbols={overviewConfig.symbols}
          data={overviewData.data}
          loading={overviewData.loading}
          error={overviewData.error}
          notice={overviewConfig.notice}
          canAdd={overviewConfig.canAdd}
          canDelete={overviewConfig.canDelete}
          onAddSymbol={overviewConfig.addSymbol}
          onDeleteSymbol={overviewConfig.deleteSymbol}
          onRefresh={overviewData.refresh}
        />
        <MarketMoversPanel movers={movers} />
      </div>
    </main>
  );
}
