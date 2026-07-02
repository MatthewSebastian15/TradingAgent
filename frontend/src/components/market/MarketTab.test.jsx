import { cleanup, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketTab from './MarketTab';

vi.mock('../../hooks/useMarketOverviewConfig', () => ({
  useMarketOverviewConfig: () => ({
    activeCategory: 'EQUITIES',
    symbols: ['^GSPC', '^IXIC'],
    notice: null,
    canAdd: true,
    canDelete: false,
    addSymbol: vi.fn(),
    deleteSymbol: vi.fn(),
    changeCategory: vi.fn(),
  }),
}));
vi.mock('../../hooks/useMarketOverviewData', () => ({
  useMarketOverviewData: (symbols) => ({
    data: symbols.map((symbol) => ({ symbol, status: 'ok' })),
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock('../../hooks/useMarketMovers', () => ({
  useMarketMovers: () => ({ id: 'movers-state' }),
}));

vi.mock('./GlobalMarketOverview', () => {
  function GlobalMarketOverviewStub({ symbols, activeCategory }) {
    return (
      <div data-testid="overview">
        {activeCategory}|{symbols.join(',')}
      </div>
    );
  }
  GlobalMarketOverviewStub.propTypes = {
    symbols: PropTypes.array,
    activeCategory: PropTypes.string,
  };
  return { default: GlobalMarketOverviewStub };
});
vi.mock('./MarketMoversPanel', () => {
  function MarketMoversPanelStub({ movers }) {
    return <div data-testid="movers">{movers.id}</div>;
  }
  MarketMoversPanelStub.propTypes = { movers: PropTypes.object };
  return { default: MarketMoversPanelStub };
});

describe('MarketTab', () => {
  afterEach(() => cleanup());

  it('wires the config, data, and movers hooks into its children', () => {
    render(<MarketTab />);

    expect(screen.getByTestId('overview').textContent).toBe('EQUITIES|^GSPC,^IXIC');
    expect(screen.getByTestId('movers').textContent).toBe('movers-state');
  });
});
