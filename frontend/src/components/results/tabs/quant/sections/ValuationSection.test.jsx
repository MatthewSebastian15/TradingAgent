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
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('values the company with CAPM WACC, reverse DCF and cash-flow table once fundamentals arrive', async () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    expect(screen.queryByText('Fair Value / Share')).toBeNull();
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(await screen.findByText('Fair Value / Share')).toBeTruthy();
    expect(screen.getByText('Implied growth (reverse DCF)')).toBeTruthy();
    expect(screen.getByText('Cost of equity (CAPM)')).toBeTruthy();
    expect(screen.getByText('Projected cash flows')).toBeTruthy();
  });

  it('refuses to mix currencies until an FX rate is entered', () => {
    render(
      <ValuationSection {...props} ccy="IDR" overview={{ ...fundamentals, currency: 'IDR' }} />
    );
    expect(screen.getByText('Reporting currency differs')).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: /Base FCF/ }).value).toBe('');
    fireEvent.change(screen.getByLabelText(/FX rate/), { target: { value: '16000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Auto-fill from fundamentals' }));
    expect(screen.getByRole('spinbutton', { name: /Base FCF/ }).value).toBe('32000000');
  });

  it('warns when the terminal value dominates', async () => {
    render(<ValuationSection {...props} overview={fundamentals} />);
    await screen.findByText('Fair Value / Share');
    fireEvent.change(screen.getByLabelText(/^Years/), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText(/Fade years/), { target: { value: '0' } });
    expect(await screen.findByText('Terminal value dominates')).toBeTruthy();
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
    expect(screen.getByRole('spinbutton', { name: /Base FCF/ }).value).toBe('2000');
    expect(screen.getByLabelText(/Shares out/).value).toBe('100');
    expect(screen.getByLabelText(/Net debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF growth/).value).toBe('10');
    expect(screen.getByLabelText(/^WACC/).value).toBe('10');
  });

  it('protects a typed FCF while the other fields still auto-fill', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Base FCF/ }), {
      target: { value: '500' },
    });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByRole('spinbutton', { name: /Base FCF/ }).value).toBe('500');
    expect(screen.getByLabelText(/Shares out/).value).toBe('100');
    expect(screen.getByLabelText(/Net debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF growth/).value).toBe('10');
  });

  it('fills only the fields present in a partial overview', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    rerender(<ValuationSection {...props} overview={{ free_cashflow: 3e9, currency: 'USD' }} />);
    expect(screen.getByRole('spinbutton', { name: /Base FCF/ }).value).toBe('3000');
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

  it('shows the WACC vs terminal growth error on the field', () => {
    render(<ValuationSection {...props} overview={fundamentals} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Terminal growth/ }), {
      target: { value: '9.9' },
    });
    const field = screen.getByRole('spinbutton', { name: /Terminal growth/ });
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/must be greater than terminal growth/)).toBeTruthy();
    expect(screen.queryByText('Check inputs')).toBeNull();
    expect(screen.getByText('Fix the highlighted fields to see a valuation.')).toBeTruthy();
  });

  it('does not show required-field errors before fundamentals load', () => {
    render(<ValuationSection {...props} overview={null} />);
    expect(screen.queryByText('Enter base free cash flow.')).toBeNull();
  });

  it('marks auto-filled fields and restores them after an edit', () => {
    render(<ValuationSection {...props} overview={fundamentals} />);
    const fcfField = () => screen.getByRole('spinbutton', { name: /Base FCF/ });
    expect(fcfField().value).toBe('2000');
    expect(screen.getAllByText('Fundamentals').length).toBeGreaterThanOrEqual(3);

    fireEvent.change(fcfField(), { target: { value: '1500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset Base FCF' }));
    expect(fcfField().value).toBe('2000');
  });

  it('restores and saves DCF assumptions for the ticker', async () => {
    window.localStorage.setItem(
      'ta:quant:preset:v1:dcf:AAPL',
      JSON.stringify({ years: 7, fadeYears: 2, terminalGrowth: 2, midYear: false })
    );
    render(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByRole('spinbutton', { name: /^Years/ }).value).toBe('7');

    fireEvent.change(screen.getByRole('spinbutton', { name: /Terminal growth/ }), {
      target: { value: '3' },
    });
    expect(JSON.parse(window.localStorage.getItem('ta:quant:preset:v1:dcf:AAPL')).terminalGrowth).toBe(
      3
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear saved inputs', hidden: true }));
    expect(window.localStorage.getItem('ta:quant:preset:v1:dcf:AAPL')).not.toContain('"years":7');
    expect(screen.getByRole('spinbutton', { name: /^Years/ }).value).toBe('5');
  });
});
