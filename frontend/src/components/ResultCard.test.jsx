import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ResultCard from './ResultCard';
import { MOCK_HOLD_RESPONSE, MOCK_RESPONSE, MOCK_SELL_RESPONSE } from '../mockData';

describe('ResultCard risk-engine contract', () => {
  afterEach(() => cleanup());

  it('renders last price and backend risk reward display for Buy result', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('LAST PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R/R RATIO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('PRICE TARGET').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('RISK PER SHARE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REWARD PER SHARE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAX DRAWDOWN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY SCORE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);
  });

  it('renders Sell action plan when trade_plan_valid is true', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.getByText('▼ SELL')).toBeTruthy();
    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exit position').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
  });

  it('keeps Hold result clean from trade-plan metrics and shows adjustment warning', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.getByText('◆ HOLD')).toBeTruthy();
    expect(screen.getByText('DECISION ADJUSTED')).toBeTruthy();
    expect(screen.getByText('Invalid risk reward structure')).toBeTruthy();
    expect(screen.getAllByText('CURRENT PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY SCORE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);

    expect(screen.queryByText('ENTRY')).toBeNull();
    expect(screen.queryByText('STOP LOSS')).toBeNull();
    expect(screen.queryByText('TAKE PROFIT')).toBeNull();
    expect(screen.queryByText('R/R RATIO')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
    expect(screen.queryByText('MAX DRAWDOWN')).toBeNull();
  });

  it('does not render action plan for invalid actionable trade plan', () => {
    render(<ResultCard result={{ ...MOCK_RESPONSE, trade_plan_valid: false }} />);

    expect(screen.getByText('TRADE PLAN NOT VALID')).toBeTruthy();
    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
  });
});
