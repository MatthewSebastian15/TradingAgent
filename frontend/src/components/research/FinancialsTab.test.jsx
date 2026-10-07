import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import FinancialsTab from './FinancialsTab';
import { getFinancials } from '../../api/market';

vi.mock('../../api/market', () => ({ getFinancials: vi.fn() }));

const income = {
  statement: 'income',
  currency: 'USD',
  unit_note: 'USD millions',
  periods: [
    { key: 'FY24', label: 'FY24' },
    { key: 'FY25', label: 'FY25' },
  ],
  rows: [
    { key: 'revenue', label: 'Revenue', unit: 'USD mn', values: { FY24: '100', FY25: '120' } },
    { key: 'ebitda', label: 'EBITDA', unit: 'USD mn', values: { FY24: '-', FY25: '30' } },
  ],
  data_quality: { status: 'partial' },
};

describe('FinancialsTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a loading skeleton, then a period-by-row table', async () => {
    getFinancials.mockResolvedValue(income);
    render(<FinancialsTab ticker="AAPL" />);

    expect(screen.getByTestId('financials-loading')).toBeTruthy();
    expect(await screen.findByText('Revenue')).toBeTruthy();
    expect(screen.getByText('FY24')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText(/USD millions/)).toBeTruthy();
    expect(getFinancials).toHaveBeenCalledWith('AAPL', 'income', {
      signal: expect.any(AbortSignal),
    });
  });

  it('hides a period column that has no value in any row', async () => {
    getFinancials.mockResolvedValue({
      ...income,
      periods: [...income.periods, { key: 'FY26Q3', label: 'FY26Q3' }],
      rows: income.rows.map((row) => ({ ...row, values: { ...row.values, FY26Q3: '-' } })),
    });
    render(<FinancialsTab ticker="AAPL" />);

    expect(await screen.findByText('Revenue')).toBeTruthy();
    expect(screen.getByText('FY25')).toBeTruthy();
    expect(screen.queryByText('FY26Q3')).toBeNull();
  });

  it('refetches when switching to the balance sheet', async () => {
    getFinancials.mockResolvedValueOnce(income).mockResolvedValueOnce({
      ...income,
      statement: 'balance',
      rows: [{ key: 'total_assets', label: 'Total Assets', values: { FY24: '1', FY25: '2' } }],
    });
    render(<FinancialsTab ticker="AAPL" />);
    await screen.findByText('Revenue');

    fireEvent.click(screen.getByRole('button', { name: 'BALANCE' }));

    expect(await screen.findByText('Total Assets')).toBeTruthy();
    expect(screen.queryByText('Revenue')).toBeNull();
    expect(getFinancials).toHaveBeenLastCalledWith('AAPL', 'balance', {
      signal: expect.any(AbortSignal),
    });
  });

  it('shows an empty state when the vendor returned nothing', async () => {
    getFinancials.mockResolvedValue({
      ...income,
      rows: [],
      data_quality: { status: 'unavailable' },
    });
    render(<FinancialsTab ticker="AAPL" />);

    expect(await screen.findByText(/NO FINANCIAL DATA/)).toBeTruthy();
  });

  it('shows the error message when the request fails', async () => {
    getFinancials.mockRejectedValue(new Error('boom'));
    render(<FinancialsTab ticker="AAPL" />);

    await waitFor(() => expect(screen.getByText(/FAILED TO LOAD: boom/)).toBeTruthy());
  });

  it('does not show the previous ticker rows after the ticker changes', async () => {
    getFinancials.mockResolvedValueOnce(income).mockReturnValueOnce(new Promise(() => {}));
    const { rerender } = render(<FinancialsTab ticker="AAPL" />);
    await screen.findByText('Revenue');

    rerender(<FinancialsTab ticker="MSFT" />);

    expect(screen.queryByText('Revenue')).toBeNull();
    expect(screen.getByTestId('financials-loading')).toBeTruthy();
  });
});
