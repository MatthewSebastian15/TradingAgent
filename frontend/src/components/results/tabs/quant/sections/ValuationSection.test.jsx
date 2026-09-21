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
});
