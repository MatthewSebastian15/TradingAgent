import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BacktestSection } from './BacktestSection';
import { backtest } from '../../quantUtils';

const closes = Array.from(
  { length: 700 },
  (_, i) => 100 * Math.exp(0.0003 * i + 0.06 * Math.sin(i / 17) + 0.01 * Math.sin(i / 3))
);
const dates = closes.map((_, i) => new Date(Date.UTC(2023, 0, 1 + i)).toISOString().slice(0, 10));
const params = { fast: 20, slow: 50, lookback: 60, costBps: 0, oosFrac: 0 };

function renderSection(overrides = {}) {
  const props = {
    strategy: 'sma',
    onStrategyChange: vi.fn(),
    params,
    onParamChange: vi.fn(),
    onApplyParams: vi.fn(),
    result: backtest(closes, 'sma', params),
    dates,
    closes,
    rf: 0,
    ppy: 252,
    ...overrides,
  };
  render(<BacktestSection {...props} />);
  return props;
}

describe('BacktestSection', () => {
  afterEach(() => cleanup());

  it('keeps fast < slow via slider bounds and labels win rates', () => {
    renderSection();
    for (const el of screen.getAllByLabelText(/Fast SMA/))
      expect(el.getAttribute('max')).toBe('49');
    for (const el of screen.getAllByLabelText(/Slow SMA/))
      expect(el.getAttribute('min')).toBe('21');
    expect(screen.getByText('Win Rate (per trade)')).toBeTruthy();
    expect(screen.getByText('Daily Hit Rate')).toBeTruthy();
  });

  it('compares strategy and buy & hold side by side and lists trades', () => {
    renderSection();
    expect(screen.getByText('Strategy vs buy & hold')).toBeTruthy();
    expect(screen.getByText('Calmar')).toBeTruthy();
    expect(screen.getByText('Recent trades')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Strategy drawdown' })).toBeTruthy();
  });

  it('toggles log scale', () => {
    renderSection();
    const toggle = screen.getByRole('button', { name: 'Log scale' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
  });

  it('runs the robustness check and applies a sweep cell', async () => {
    const props = renderSection();
    fireEvent.click(screen.getByRole('button', { name: 'Run robustness check' }));
    await waitFor(() => expect(screen.getByText('Parameter sweep · Sharpe')).toBeTruthy(), {
      timeout: 5000,
    });
    expect(screen.getByText('Walk-forward (anchored, 4 folds)')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /^-?\d+\.\d{2}$/ })[0]);
    expect(props.onApplyParams).toHaveBeenCalledWith(
      expect.objectContaining({ fast: expect.any(Number) })
    );
  });
});
