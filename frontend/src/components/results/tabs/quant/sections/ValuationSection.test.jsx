import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ValuationSection } from './ValuationSection';
import { getStockOverview } from '../../../../../api/market';

vi.mock('../../../../../api/market', () => ({ getStockOverview: vi.fn() }));

describe('ValuationSection inputs', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows no fair value until fundamentals arrive, then auto-fills', async () => {
    getStockOverview.mockResolvedValueOnce({
      free_cashflow: 2e9,
      shares_outstanding: 1e8,
      total_debt: 5e8,
      total_cash: 1e8,
      earnings_growth: 0.12,
    });
    render(<ValuationSection spot={150} defaultRate={0.04} ccy="USD" symbol="AAPL" />);

    expect(screen.queryByText('Fair Value / Share')).toBeNull();
    expect(await screen.findByText('Fair Value / Share')).toBeTruthy();
    expect(screen.getByLabelText(/Base FCF/).value).toBe('2000');
  });

  it('asks for inputs when fundamentals fail', async () => {
    getStockOverview.mockRejectedValueOnce(new Error('down'));
    render(<ValuationSection spot={150} defaultRate={0.04} ccy="USD" symbol="AAPL" />);

    expect(await screen.findByText(/Fundamentals unavailable/)).toBeTruthy();
    expect(screen.getByText('Inputs needed')).toBeTruthy();
    expect(screen.queryByText('Fair Value / Share')).toBeNull();
  });
});
