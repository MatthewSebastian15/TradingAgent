import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ValuationSection } from './ValuationSection';

const fundamentals = {
  free_cashflow: 2e9,
  shares_outstanding: 1e8,
  total_debt: 5e8,
  total_cash: 1e8,
  earnings_growth: 0.12,
  currency: 'USD',
};
const props = { spot: 150, defaultRate: 0.04, ccy: 'USD', symbol: 'AAPL', overviewError: null };

describe('ValuationSection inputs', () => {
  afterEach(() => cleanup());

  it('shows no fair value until fundamentals arrive, then auto-fills', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    expect(screen.queryByText('Fair Value / Share')).toBeNull();

    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByText('Fair Value / Share')).toBeTruthy();
    expect(screen.getByLabelText(/Base FCF/).value).toBe('2000');
  });

  it('asks for inputs when fundamentals fail', () => {
    render(<ValuationSection {...props} overview={null} overviewError="down" />);
    expect(screen.getByText(/Fundamentals unavailable/)).toBeTruthy();
    expect(screen.getByText('Inputs needed')).toBeTruthy();
  });

  it('never overwrites a value the user typed', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByLabelText(/Base FCF/), { target: { value: '500' } });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('500');
  });

  it('still auto-fills fundamentals after the user edited only WACC', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByLabelText(/WACC/), { target: { value: '10' } });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('2000');
    expect(screen.getByLabelText(/Shares Out/).value).toBe('100');
    expect(screen.getByLabelText(/Net Debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF Growth/).value).toBe('12');
    expect(screen.getByLabelText(/WACC/).value).toBe('10');
  });

  it('fills only the fields present in a partial overview', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    rerender(<ValuationSection {...props} overview={{ free_cashflow: 3e9 }} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('3000');
    expect(screen.getByLabelText(/Shares Out/).value).toBe('');
    expect(screen.getByLabelText(/Net Debt/).value).toBe('0');
    expect(screen.getByLabelText(/FCF Growth/).value).toBe('8');
  });

  it('protects a typed FCF while the other fields still auto-fill', () => {
    const { rerender } = render(<ValuationSection {...props} overview={null} />);
    fireEvent.change(screen.getByLabelText(/Base FCF/), { target: { value: '500' } });
    rerender(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByLabelText(/Base FCF/).value).toBe('500');
    expect(screen.getByLabelText(/Shares Out/).value).toBe('100');
    expect(screen.getByLabelText(/Net Debt/).value).toBe('400');
    expect(screen.getByLabelText(/FCF Growth/).value).toBe('12');
  });

  it('marks every sensitivity cell with a direction glyph and outlines the base case', () => {
    const { container } = render(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByText('Sensitivity · fair value per share')).toBeTruthy();
    const cells = [...container.querySelectorAll('tbody td')].filter((td) =>
      td.textContent.match(/[▲▼]/)
    );
    expect(cells).toHaveLength(25);
    cells.forEach((td) => {
      const up = td.textContent.endsWith('▲');
      expect(td.style.backgroundColor).toContain(up ? '34, 197, 94' : '239, 68, 68');
    });
    const base = container.querySelector('td[aria-current="true"]');
    expect(base.closest('tr').querySelectorAll('td')[2]).toBe(base);
  });

  it('draws the Monte Carlo histogram with plain-text labels', () => {
    render(<ValuationSection {...props} overview={fundamentals} />);
    expect(screen.getByRole('button', { name: 'Auto-fill from fundamentals' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Monte Carlo/ }));
    expect(
      screen.getByRole('img', { name: 'Distribution of DCF fair value across sampled assumptions' })
    ).toBeTruthy();
  });
});
