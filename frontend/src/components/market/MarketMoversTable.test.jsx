import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import MarketMoversTable from './MarketMoversTable';

const ITEMS = [
  { symbol: 'NVDA', last: 130.5, change_percent: 4.2, volume: 1_000_000, trend: [1, 2, 3] },
  { symbol: 'AAPL', last: 210.1, change_percent: 2.1, volume: 2_000_000, trend: [2, 1, 3] },
];

describe('MarketMoversTable', () => {
  afterEach(() => cleanup());

  it('renders headers, one row per item, and the shown count', () => {
    render(
      <MarketMoversTable
        title="Top Gainers"
        items={ITEMS}
        loading={false}
        limit={5}
        emptyText="No movers."
        tone="positive"
      />
    );

    expect(screen.getByText('Top Gainers')).toBeTruthy();
    expect(screen.getByText('2 shown')).toBeTruthy();
    expect(screen.getByText('NVDA')).toBeTruthy();
    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'trend line' })).toHaveLength(2);
  });

  it('renders skeleton rows while loading', () => {
    const { container } = render(
      <MarketMoversTable
        title="Top Losers"
        items={[]}
        loading
        limit={5}
        emptyText="No movers."
        tone="negative"
      />
    );

    expect(container.querySelectorAll('tbody tr')).toHaveLength(5);
    expect(screen.queryByText('No movers.')).toBeNull();
  });

  it('shows the empty text when idle with no items', () => {
    render(
      <MarketMoversTable
        title="Top Losers"
        items={[]}
        loading={false}
        limit={5}
        emptyText="No movers."
        tone="negative"
      />
    );

    expect(screen.getByText('No movers.')).toBeTruthy();
    expect(screen.getByText('0 shown')).toBeTruthy();
  });
});
