import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketOverviewCard from './MarketOverviewCard';

const OK_ITEM = {
  symbol: '^GSPC',
  status: 'ok',
  last: 5432.1,
  change: 12.3,
  change_percent: 0.23,
  sparkline: [1, 2, 3],
};

describe('MarketOverviewCard', () => {
  afterEach(() => cleanup());

  it('renders label, symbol badge, price block, and sparkline when ok', () => {
    render(<MarketOverviewCard item={OK_ITEM} canDelete onDelete={vi.fn()} />);

    // Label resolves from the preset table for known symbols.
    expect(screen.getByText('S&P 500')).toBeTruthy();
    expect(screen.getByText('^GSPC')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'sparkline' })).toBeTruthy();
  });

  it('shows the failure reason when status is not ok', () => {
    render(
      <MarketOverviewCard
        item={{ symbol: 'BAD', status: 'error', reason: 'No yfinance data' }}
        canDelete
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText('No yfinance data')).toBeTruthy();
  });

  it('renders skeletons while loading', () => {
    const { container } = render(
      <MarketOverviewCard item={OK_ITEM} canDelete onDelete={vi.fn()} loading />
    );

    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(screen.queryByText('S&P 500')).toBeNull();
  });

  it('wires the delete button and disables it when deleting is not allowed', () => {
    const onDelete = vi.fn();
    render(<MarketOverviewCard item={OK_ITEM} canDelete onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete instrument'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    cleanup();

    render(<MarketOverviewCard item={OK_ITEM} canDelete={false} onDelete={vi.fn()} />);
    expect(screen.getByTitle('Minimum 3 instruments required').disabled).toBe(true);
  });
});
