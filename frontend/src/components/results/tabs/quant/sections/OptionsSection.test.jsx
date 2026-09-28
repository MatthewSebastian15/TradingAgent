import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { OptionsSection } from './OptionsSection';

const closes = Array.from({ length: 120 }, (_, i) => 100 + 5 * Math.sin(i / 4));
const props = {
  spot: 100,
  closes,
  ppy: 252,
  defaultRate: 0.04,
  ccy: 'USD',
  overview: { div_rate: 2 },
  fallbackVol: 25,
  symbol: 'AAPL',
};

describe('OptionsSection', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('shows call and put side by side with probability of finishing in the money', () => {
    render(<OptionsSection {...props} />);
    expect(screen.getByText('Call vs put')).toBeTruthy();
    expect(screen.getByText('P(ITM), risk-neutral')).toBeTruthy();
    expect(screen.getByText('Auto: 2.00%')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Option payoff at expiry and today' })).toBeTruthy();
  });

  it('applies moneyness presets', () => {
    render(<OptionsSection {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '+5%' }));
    expect(screen.getByRole('spinbutton', { name: /Strike/ }).value).toBe('105');
  });

  it('explains an implied-vol price below intrinsic value', () => {
    render(<OptionsSection {...props} />);
    fireEvent.change(screen.getByLabelText(/Market price/), { target: { value: '0.1' } });
    expect(screen.getByText(/at or below intrinsic value/)).toBeTruthy();
  });

  it('marks an invalid strike on the field', () => {
    render(<OptionsSection {...props} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: /Strike/ }), {
      target: { value: '0' },
    });
    expect(screen.getByRole('spinbutton', { name: /Strike/ }).getAttribute('aria-invalid')).toBe(
      'true'
    );
    expect(screen.getByText('Strike must be greater than 0.')).toBeTruthy();
    expect(screen.queryByText('Call vs put')).toBeNull();
  });

  it('remembers expiry and option type per ticker', () => {
    window.localStorage.setItem(
      'ta:quant:preset:v1:options:AAPL',
      JSON.stringify({ days: 90, type: 'put' })
    );
    render(<OptionsSection {...props} />);
    expect(screen.getByRole('spinbutton', { name: /Days to expiry/ }).value).toBe('90');
    expect(screen.getByRole('button', { name: 'Put' }).getAttribute('aria-pressed')).toBe('true');
    window.localStorage.clear();
  });
});
