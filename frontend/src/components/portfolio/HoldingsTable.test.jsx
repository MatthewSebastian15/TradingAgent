import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HoldingsTable from './HoldingsTable';

const ROWS = [
  {
    holding: { id: 'h1', ticker: 'AAPL', shares: 10, cost_basis: 100 },
    price: 120,
    chg: '+1.00%',
    trend: [1, 2, 3],
  },
];

function renderTable(props = {}) {
  const onAdd = vi.fn(async () => true);
  const onRemove = vi.fn();
  render(<HoldingsTable rows={[]} totalValue={0} onAdd={onAdd} onRemove={onRemove} {...props} />);
  return { onAdd, onRemove };
}

describe('HoldingsTable', () => {
  afterEach(() => cleanup());

  it('shows the empty state without rows', () => {
    renderTable();

    expect(screen.getByText(/No holdings yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders a row with derived value, P/L, and weight', () => {
    const { onRemove } = renderTable({ rows: ROWS, totalValue: 2400 });

    expect(screen.getByText('AAPL')).toBeTruthy();
    // 10 shares × 120 = 1,200 market value; +200 P/L; 50% weight of 2,400.
    expect(screen.getByText('1,200.00')).toBeTruthy();
    expect(screen.getByText('200.00 / +20.00%')).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Remove AAPL'));
    expect(onRemove).toHaveBeenCalledWith('h1');
  });

  it('submits a new holding and clears the form on success', async () => {
    const { onAdd } = renderTable();

    fireEvent.change(screen.getByLabelText('Ticker'), { target: { value: 'NVDA' } });
    fireEvent.change(screen.getByLabelText('Shares'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Average cost per share'), {
      target: { value: '90' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add/ }));

    expect(onAdd).toHaveBeenCalledWith({ ticker: 'NVDA', shares: 5, cost_basis: 90 });
    await waitFor(() => expect(screen.getByLabelText('Ticker').value).toBe(''));
  });

  it('shows a storage error and disables the add button while busy', () => {
    renderTable({ error: 'quota exceeded', busy: true });

    expect(screen.getByRole('alert').textContent).toBe('quota exceeded');
    expect(screen.getByRole('button', { name: /Add/ }).disabled).toBe(true);
  });
});
