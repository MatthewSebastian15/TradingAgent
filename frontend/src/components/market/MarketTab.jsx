import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import GlobalMarketOverview from './GlobalMarketOverview';
import MarketMoversPanel from './MarketMoversPanel';
import { useMarketMovers } from '../../hooks/useMarketMovers';
import { useMarketOverviewConfig } from '../../hooks/useMarketOverviewConfig';
import { useMarketOverviewData } from '../../hooks/useMarketOverviewData';

export default function MarketTab() {
  const overviewConfig = useMarketOverviewConfig();
  const overviewData = useMarketOverviewData(overviewConfig.symbols);
  const movers = useMarketMovers();

  return (
    <main className="bg-bloomberg-bg px-2 py-3 font-mono text-bloomberg-white sm:px-4">
      <Card className="rounded-xl border-bloomberg-border bg-card text-bloomberg-white shadow-xl shadow-black/30">
        <CardContent className="grid gap-3 p-3">
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
            onChangeCategory={overviewConfig.changeCategory}
          />
          <MarketMoversPanel movers={movers} />
        </CardContent>
      </Card>
    </main>
  );
}
