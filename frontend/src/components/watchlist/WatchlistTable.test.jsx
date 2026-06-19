import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WatchlistTable from './WatchlistTable';

afterEach(() => {
  cleanup();
});

const items = [
  {
    symbol: 'NVDA',
    name: 'NVIDIA Corporation',
    exchange: 'NASDAQ',
    market: 'US',
    type: 'EQUITY',
  },
];

describe('WatchlistTable', () => {
  it('renders compact quote rows with volume and trend', () => {
    render(
      <WatchlistTable
        items={items}
        quotesBySymbol={
          new Map([
            ['NVDA', { sym: 'NVDA', price: 210.69, chg: '+2.95%', pos: true, volume: 246900000 }],
          ])
        }
        trendsBySymbol={new Map([['NVDA', [189.2, 191.4, 195.8, 210.69]]])}
        loading={false}
        onDeleteTicker={vi.fn()}
      />
    );

    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText('210.69')).toBeTruthy();
    expect(screen.getByText('+2.95%')).toBeTruthy();
    expect(screen.getByText('246.9M')).toBeTruthy();
    expect(screen.getByLabelText('Positive trend')).toBeTruthy();
  });

  it('renders unavailable quote data as dash', () => {
    render(
      <WatchlistTable
        items={items}
        quotesBySymbol={new Map()}
        trendsBySymbol={new Map()}
        loading={false}
        onDeleteTicker={vi.fn()}
      />
    );

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
    expect(screen.getByLabelText('No trend data')).toBeTruthy();
  });

  it('deletes a ticker from the table', () => {
    const onDeleteTicker = vi.fn();

    render(
      <WatchlistTable
        items={items}
        quotesBySymbol={{}}
        trendsBySymbol={{}}
        loading={false}
        onDeleteTicker={onDeleteTicker}
      />
    );

    fireEvent.click(screen.getByLabelText('Delete NVDA'));

    expect(onDeleteTicker).toHaveBeenCalledWith('NVDA');
  });

  it('renders empty group state', () => {
    render(
      <WatchlistTable
        items={[]}
        quotesBySymbol={{}}
        trendsBySymbol={{}}
        loading={false}
        onDeleteTicker={vi.fn()}
      />
    );

    expect(screen.getByText('No ticker in this group yet.')).toBeTruthy();
    expect(screen.getByText('Search a ticker above and click ADD.')).toBeTruthy();
  });
});
