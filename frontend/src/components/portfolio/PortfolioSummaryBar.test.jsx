import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import PortfolioSummaryBar from './PortfolioSummaryBar';

describe('PortfolioSummaryBar', () => {
  afterEach(() => cleanup());

  it('renders tracked count, win rate, and best/worst tickers', () => {
    render(
      <PortfolioSummaryBar
        summary={{
          trackedCount: 4,
          winRate: 0.75,
          avgReturn: 0.123,
          best: { ticker: 'NVDA', return: 0.4 },
          worst: { ticker: 'GOTO', return: -0.2 },
        }}
      />
    );

    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('75%')).toBeTruthy();
    expect(screen.getByText('+12.30%').className).toContain('text-bloomberg-green');
    expect(screen.getByText('NVDA +40.00%')).toBeTruthy();
    expect(screen.getByText('GOTO -20.00%').className).toContain('text-bloomberg-red');
  });

  it('renders dashes when nothing is tracked', () => {
    render(
      <PortfolioSummaryBar
        summary={{ trackedCount: 0, winRate: null, avgReturn: null, best: null, worst: null }}
      />
    );

    expect(screen.getAllByText('-').length).toBeGreaterThanOrEqual(3);
  });
});
