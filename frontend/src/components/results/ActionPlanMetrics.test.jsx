import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ActionableMetrics, HoldMetrics } from './ActionPlanMetrics';

const RESULT = {
  ticker: 'AAPL',
  currency: 'USD',
  entry_price: 100,
  stop_loss: 90,
  take_profit: 130,
  volatility_level: 'Moderate',
  rebalancing_action: 'Trim 10%',
  position_size_hint: 'Half position',
};

describe('ActionableMetrics', () => {
  afterEach(() => cleanup());

  it('renders the full action-plan grid with formatted prices and N/A fallbacks', () => {
    render(<ActionableMetrics result={RESULT} currentPrice={110} riskReward="2.5" />);

    expect(screen.getByText('ACTION PLAN')).toBeTruthy();
    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
    expect(screen.getByText('ENTRY')).toBeTruthy();
    expect(screen.getByText('STOP LOSS')).toBeTruthy();
    expect(screen.getByText('R/R RATIO')).toBeTruthy();
    expect(screen.getByText('2.5')).toBeTruthy();
    // Unset fields (e.g. MAX DRAWDOWN, POSITION ACTION) fall back to N/A.
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });
});

describe('HoldMetrics', () => {
  afterEach(() => cleanup());

  it('renders nothing when no hold metrics exist', () => {
    const { container } = render(<HoldMetrics result={{}} currentPrice={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders the action status row when hold data exists', () => {
    render(<HoldMetrics result={RESULT} currentPrice={110} />);

    expect(screen.getByText('ACTION STATUS')).toBeTruthy();
    expect(screen.getByText('VOLATILITY')).toBeTruthy();
    expect(screen.getByText('Moderate')).toBeTruthy();
    expect(screen.getByText('Trim 10%')).toBeTruthy();
  });
});
