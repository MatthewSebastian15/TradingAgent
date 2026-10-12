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
  render(
    <HoldingsTable rows={[]} totalsByCurrency={{}} onAdd={onAdd} onRemove={onRemove} {...props} />
  );
  return { onAdd, onRemove };
}

describe('HoldingsTable', () => {
  afterEach(() => cleanup());

  it('shows the empty state without rows', () => {
    renderTable();

    const msg = screen.getByText(/No holdings yet/);
    expect(msg.className).not.toMatch(/text-bloomberg-muted/);
    expect(msg.className).toMatch(/text-bloomberg-white/);
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('renders a row with derived value, P/L, and weight', () => {
    const { onRemove } = renderTable({ rows: ROWS, totalsByCurrency: { USD: 2400 } });

    expect(screen.getByText('AAPL')).toBeTruthy();
    // 10 shares × 120 = 1,200 market value; +200 P/L; 50% weight of 2,400.
    expect(screen.getByText('$1,200.00')).toBeTruthy();
    expect(screen.getByText('+$200.00 / +20.00%')).toBeTruthy();
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

  it('formats each row in its own currency and computes weight within that currency', () => {
    renderTable({
      rows: [
        {
          holding: { id: 'h1', ticker: 'AAPL', shares: 10, cost_basis: 100 },
          price: 120,
          chg: '+1.00%',
          trend: [],
          currency: 'USD',
        },
        {
          holding: { id: 'h2', ticker: 'BBCA.JK', shares: 100, cost_basis: 9000 },
          price: 9500,
          chg: '+1.00%',
          trend: [],
          currency: 'IDR',
        },
      ],
      totalsByCurrency: { USD: 1200, IDR: 950000 },
    });

    expect(screen.getByText('Rp 950,000')).toBeTruthy(); // market value, no decimals
    expect(screen.getByText('+Rp 50,000 / +5.56%')).toBeTruthy();
    expect(screen.getAllByText('100.0%')).toHaveLength(2); // each is the whole of its own currency
  });

  it('shows dashes, not zeros, for a lot without a live price', () => {
    renderTable({
      rows: [
        {
          holding: { id: 'h1', ticker: 'AAPL', shares: 10, cost_basis: 100 },
          price: null,
          chg: 'N/A',
          trend: [],
          currency: 'USD',
        },
      ],
      totalsByCurrency: {},
    });

    expect(screen.queryByText(/-100\.00%/)).toBeNull();
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});
