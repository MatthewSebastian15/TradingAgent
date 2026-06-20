import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GlobalMarketOverview from './GlobalMarketOverview';

vi.mock('./MarketCategoryTabs', () => ({
  default: () => <div>MarketCategoryTabs</div>,
}));

vi.mock('./MarketOverviewCard', () => ({
  default: ({ item }) => <div>{item.symbol}</div>,
}));

vi.mock('./MarketOverviewPicker', () => ({
  default: () => <div>MarketOverviewPicker</div>,
}));

function renderOverview(props = {}) {
  return render(
    <GlobalMarketOverview
      activeCategory="global"
      symbols={['SPY', 'QQQ', 'DIA']}
      data={{
        items: [{ symbol: 'SPY', status: 'ok' }],
        source: 'yfinance',
        last_updated: '2026-06-17T12:00:00Z',
        cache: { hit: false, ttl_seconds: 120, force_refresh: true },
      }}
      loading={false}
      error=""
      canAdd
      canDelete
      onAddSymbol={vi.fn()}
      onDeleteSymbol={vi.fn()}
      onRefresh={vi.fn()}
      onChangeCategory={vi.fn()}
      {...props}
    />
  );
}

describe('GlobalMarketOverview', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders compact freshness metadata', () => {
    renderOverview();

    expect(screen.getByText(/YFINANCE/i)).toBeInTheDocument();
    expect(screen.getByText(/UPDATED/i)).toBeInTheDocument();
    expect(screen.getByText(/FRESH/i)).toBeInTheDocument();
  });

  it('renders cache hit metadata when response comes from cache', () => {
    renderOverview({
      data: {
        items: [{ symbol: 'SPY', status: 'ok' }],
        source: 'yfinance',
        last_updated: '2026-06-17T12:00:00Z',
        cache: { hit: true, ttl_seconds: 120, force_refresh: false },
      },
    });

    expect(screen.getByText(/CACHE HIT/i)).toBeInTheDocument();
  });
});
