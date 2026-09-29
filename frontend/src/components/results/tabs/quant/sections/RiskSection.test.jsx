import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RiskSection } from './RiskSection';
import { benchmarkStats, sharpeStats } from '../../quantUtils';

const market = Array.from(
  { length: 300 },
  (_, i) => 0.01 * Math.sin(i / 3) + (i % 7 === 0 ? -0.006 : 0.001)
);
const returns = market.map((x, i) => 1.2 * x + (i % 2 ? 0.002 : -0.0015));
const closes = returns.reduce((acc, r) => [...acc, acc.at(-1) * (1 + r)], [100]);
const dates = closes.map((_, i) => new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10));

const baseProps = {
  ccy: 'USD',
  rfPct: 4,
  benchLabel: 'S&P 500',
  benchAvailable: true,
  benchStatus: 'ready',
  returns,
  closes,
  ewmaSigma: 0.012,
  dd: -20,
  cal: 0.5,
  srt: 1.1,
  downDev: 12,
  sharpeInfo: sharpeStats(returns, 0.04 / 252),
  obs: returns.length,
  benchStats: benchmarkStats(returns, market, 0.04 / 252),
  ddStats: {
    maxDD: -20,
    maxDDDuration: 40,
    maxDDRecovered: true,
    recoveryDays: 12,
    currentUnderwaterDays: 0,
    episodes: 2,
  },
  topDD: [
    {
      peakDate: dates[10],
      troughDate: dates[30],
      recoveryDate: dates[60],
      depth: -12.5,
      lengthDays: 50,
      recoveryDays: 30,
    },
  ],
  ddPoints: dates.map((date, i) => ({ date, value: -Math.abs(Math.sin(i / 20)) * 10 })),
  rsPoints: [],
  rbPoints: [],
};

describe('RiskSection', () => {
  afterEach(() => cleanup());

  it('renders Max Drawdown once and the Sharpe standard error', () => {
    render(<RiskSection {...baseProps} />);
    expect(screen.getAllByText('Max Drawdown')).toHaveLength(1);
    expect(screen.getByText(/^SE /)).toBeTruthy();
  });

  it('switches the VaR table to a 10-day horizon and prices a position', () => {
    render(<RiskSection {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: '10D' }));
    expect(screen.getByText('VaR 95% (10D)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Position value/), { target: { value: '10000' } });
    const table = screen.getByText('Value at Risk').closest('table');
    expect(within(table).getAllByText(/^USD /).length).toBeGreaterThan(0);
  });

  it('shows benchmark-relative statistics and top drawdowns', () => {
    render(<RiskSection {...baseProps} />);
    expect(screen.getByText('R²')).toBeTruthy();
    expect(screen.getByText('Down capture')).toBeTruthy();
    expect(screen.getByText('-12.5%')).toBeTruthy();
  });

  it('does not crash switching to the 10D horizon with short history', () => {
    const shortReturns = returns.slice(0, 24);
    const shortCloses = closes.slice(0, 25);
    render(
      <RiskSection
        {...baseProps}
        returns={shortReturns}
        closes={shortCloses}
        benchStats={null}
        obs={shortReturns.length}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '10D' }));
    expect(screen.getByText('VaR 95% (10D)')).toBeTruthy();
    const table = screen.getByText('Value at Risk').closest('table');
    expect(within(table).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('shows a skeleton while benchmark data loads', () => {
    render(<RiskSection {...baseProps} benchStats={null} benchStatus="loading" />);
    expect(screen.getByRole('status', { name: 'Loading benchmark statistics' })).toBeTruthy();
    expect(screen.queryByText(/data unavailable/)).toBeNull();
  });

  it('flags an unavailable benchmark in amber instead of an empty table', () => {
    render(
      <RiskSection
        {...baseProps}
        benchStats={null}
        benchAvailable={false}
        benchStatus="unavailable"
      />
    );
    expect(screen.getByText('Benchmark unavailable')).toBeTruthy();
    expect(screen.queryByRole('status', { name: 'Loading benchmark statistics' })).toBeNull();
  });

  it('flags an insignificant Sharpe ratio', () => {
    render(
      <RiskSection
        {...baseProps}
        sharpeInfo={{
          sharpe: 0.3,
          standardError: 0.4,
          tStat: 0.75,
          probabilisticSharpe: 0.77,
          observations: 300,
        }}
      />
    );
    expect(screen.getByText(/· not significant$/)).toBeTruthy();
  });

  it('does not claim significance when the alpha t-stat is unavailable', () => {
    render(
      <RiskSection
        {...baseProps}
        benchStats={{ ...baseProps.benchStats, alpha: 1.2, alphaTStat: null }}
      />
    );
    expect(screen.queryByText(/Significant at roughly 95%/)).toBeNull();
    expect(screen.getByText(/t-stat unavailable/)).toBeTruthy();
  });
});
