import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ValuationSection } from './ValuationSection';

vi.mock('../../../../../api/market', () => ({
  getStockOverview: vi.fn(async (sym) => ({ ticker: sym, pe_ttm: sym === 'MSFT' ? 30 : 20 })),
}));

const fundamentals = {
  free_cashflow: 2e9,
  shares_outstanding: 1e8,
  total_debt: 5e8,
  total_cash: 1e8,
  revenue_growth: 0.1,
  market_cap: 1.5e10,
  pe_ttm: 25,
  currency: 'USD',
  financial_currency: 'USD',
};
const props = {
  spot: 150,
  defaultRate: 0.04,
  ccy: 'USD',
  symbol: 'AAPL',
  overviewError: null,
  beta: 1.1,
  peerSymbols: [],
};

describe('ValuationSection', () => {
  afterEach(() => cleanup());

  it('values the company with CAPM WACC, reverse DCF and cash-flow table once fundamentals arrive', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    expect(screen.queryByText('Fair Value / Share')).toBeNull();
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByText('Fair Value / Share')).toBeTruthy();
    expect(screen.getByText('Implied growth (reverse DCF)')).toBeTruthy();
    expect(screen.getByText('Cost of equity (CAPM)')).toBeTruthy();
    expect(screen.getByText('Projected cash flows')).toBeTruthy();
  });

  it('refuses to mix currencies until an FX rate is entered', () => {
    render(
      <ValuationSection {...props} ccy="IDR" overview={{ ...fundamentals, currency: 'IDR' }} />
    );
    expect(screen.getByText('Reporting currency differs')).toBeTruthy();
    expect(screen.getByLabelText(/Base FCF/).value).toBe('');
    fireEvent.change(screen.getByLabelText(/FX rate/), { target: { value: '16000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill from fundamentals' }));
    expect(screen.getByLabelText(/Base FCF/).value).toBe('32000000');
  });

  it('warns when the terminal value dominates', () => {
    render(<ValuationSection {...props} overview={fundamentals} />);
    fireEvent.change(screen.getByLabelText(/^Years/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Fade years/), { target: { value: '0' } });
    expect(screen.getByText('Terminal value dominates')).toBeTruthy();
  });

  it('compares multiples with peer medians', async () => {
    render(<ValuationSection {...props} overview={fundamentals} peerSymbols={['MSFT', 'GOOGL']} />);
    await waitFor(() => expect(screen.getByText('Peer median')).toBeTruthy());
    expect(screen.getByText('+0.0%')).toBeTruthy();
  });

  it('still auto-fills fundamentals after the user edited only WACC', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /CAPM WACC/ }));
    fireEvent.change(screen.getByLabelText(/^WACC/), { target: { value: '10' } });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('2000');
    expect(screen.getByLabelText(/Shares out/).value).toBe('100');
    expect(screen.getByLabelText(/Net debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF growth/).value).toBe('10');
    expect(screen.getByLabelText(/^WACC/).value).toBe('10');
  });

  it('protects a typed FCF while the other fields still auto-fill', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByLabelText(/Base FCF/), { target: { value: '500' } });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('500');
    expect(screen.getByLabelText(/Shares out/).value).toBe('100');
    expect(screen.getByLabelText(/Net debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF growth/).value).toBe('10');
  });

  it('fills only the fields present in a partial overview', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    rerender(<ValuationSection {...props} overview={{ free_cashflow: 3e9, currency: 'USD' }} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('3000');
    expect(screen.getByLabelText(/Shares out/).value).toBe('');
    expect(screen.getByLabelText(/Net debt/).value).toBe('0');
    expect(screen.getByLabelText(/FCF growth/).value).toBe('8');
  });

  it('reads the live growth source dropdown in the auto-fill effect, not just the manual button', () => {
    const overviewBoth = { ...fundamentals, revenue_growth: 0.1, earnings_growth: 0.2 };
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByLabelText(/Growth source/), { target: { value: 'earnings' } });
    rerender(<ValuationSection {...props} overview={overviewBoth} />);
    expect(screen.getByLabelText(/FCF growth/).value).toBe('20');
  });
});
