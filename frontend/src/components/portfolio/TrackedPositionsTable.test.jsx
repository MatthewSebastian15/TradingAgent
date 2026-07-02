import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TrackedPositionsTable from './TrackedPositionsTable';

function buildRow(overrides = {}) {
  return {
    position: {
      id: 'p1',
      ticker: 'AAPL',
      decision: 'BUY',
      confidence_score: 80,
      entry_price: 100,
      entry_at: new Date().toISOString(),
      time_horizon_months: 1,
      ...overrides,
    },
    current: 110,
    trend: [1, 2, 3],
  };
}

describe('TrackedPositionsTable', () => {
  afterEach(() => cleanup());

  it('shows the empty state without rows', () => {
    render(<TrackedPositionsTable rows={[]} onRemove={vi.fn()} />);

    expect(screen.getByText(/No tracked recommendations yet/)).toBeTruthy();
  });

  it('renders a position with directional return and remove action', () => {
    const onRemove = vi.fn();
    render(<TrackedPositionsTable rows={[buildRow()]} onRemove={onRemove} />);

    expect(screen.getByText('AAPL')).toBeTruthy();
    expect(screen.getByText('BUY')).toBeTruthy();
    expect(screen.getByText('80')).toBeTruthy();
    // BUY from 100 to 110 → +10.00%, green.
    expect(screen.getByText('+10.00%').className).toContain('text-bloomberg-green');

    fireEvent.click(screen.getByLabelText('Stop tracking AAPL'));
    expect(onRemove).toHaveBeenCalledWith('p1');
  });

  it('flags a matured horizon and dashes an unknown return', () => {
    const row = buildRow({ entry_at: '2020-01-01T00:00:00Z' });
    row.current = Number.NaN;
    render(<TrackedPositionsTable rows={[row]} onRemove={vi.fn()} />);

    expect(screen.getByText('MATURED')).toBeTruthy();
    expect(screen.getAllByText('-').length).toBeGreaterThan(0);
  });
});
