import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ResultCard from './ResultCard';
import {
  MOCK_HOLD_RESPONSE,
  MOCK_MISSING_PRICE_RESPONSE,
  MOCK_REPAIRED_RESPONSE,
  MOCK_RESPONSE,
  MOCK_SELL_RESPONSE,
} from '../mockData';

describe('ResultCard risk-engine contract', () => {
  afterEach(() => cleanup());

  it('renders Last Price for a Buy result', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('LAST PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$920').length).toBeGreaterThan(0);
  });

  it('renders Buy entry, stop loss, and take profit when trade_plan_valid is true', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
  });

  it('renders backend risk/reward display as 1:3 for Buy', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByText('R/R RATIO').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
  });

  it('does not render higher RR variants for valid Buy and Sell results', () => {
    const higherRiskRewardPattern = /1:[45]/;
    const { rerender } = render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText(higherRiskRewardPattern)).toBeNull();

    rerender(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.queryByText(higherRiskRewardPattern)).toBeNull();
  });

  it('does not render removed action-plan fields', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });

  it('does not render removed action-plan fields for Sell result', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });

  it('does not render PRICE TARGET in decision hero key metrics', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
  });

  it('renders action plan as exactly 12 metrics for a valid Buy result', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
  });

  it('renders action plan as exactly 12 metrics for a valid Sell result', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.getAllByTestId('action-plan-metric')).toHaveLength(12);
  });

  it('renders action plan metrics in the required order', () => {
    render(<ResultCard result={MOCK_RESPONSE} />);

    const labels = screen
      .getAllByTestId('action-plan-metric')
      .map((node) => node.querySelector('div')?.textContent);

    expect(labels).toEqual([
      'CURRENT PRICE',
      'ENTRY',
      'STOP LOSS',
      'TAKE PROFIT',
      'MAX DRAWDOWN',
      'VOLATILITY',
      'VOLATILITY SCORE',
      'REBALANCING',
      'POSITION ACTION',
      'NEW ENTRY ACTION',
      'POSITION SIZE HINT',
      'R/R RATIO',
    ]);
  });

  it('renders a complete Sell action plan when trade_plan_valid is true', () => {
    render(<ResultCard result={MOCK_SELL_RESPONSE} />);

    expect(screen.getByText('▼ SELL')).toBeTruthy();
    expect(screen.getAllByText('CURRENT PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('ENTRY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('STOP LOSS').length).toBeGreaterThan(0);
    expect(screen.getAllByText('TAKE PROFIT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('MAX DRAWDOWN').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Exit position').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1:3').length).toBeGreaterThan(0);
  });

  it('keeps Hold result limited to status metrics', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.getByText('◆ HOLD')).toBeTruthy();
    expect(screen.getAllByText('CURRENT PRICE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY').length).toBeGreaterThan(0);
    expect(screen.getAllByText('VOLATILITY SCORE').length).toBeGreaterThan(0);
    expect(screen.getAllByText('REBALANCING').length).toBeGreaterThan(0);
    expect(screen.getAllByText('POSITION SIZE HINT').length).toBeGreaterThan(0);
  });

  it('does not render Hold trade-plan metrics even when backend sends debug fields', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_HOLD_RESPONSE,
          price_target: 220,
          entry_price: 190,
          stop_loss: 180,
          take_profit: 220,
          risk_per_share: 10,
          reward_per_share: 30,
          risk_reward_ratio: 3,
          risk_reward_display: '1:3',
          max_drawdown_estimate: '6-10%',
        }}
      />
    );

    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
    expect(screen.queryByText('STOP LOSS')).toBeNull();
    expect(screen.queryByText('TAKE PROFIT')).toBeNull();
    expect(screen.queryByText('R/R RATIO')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
    expect(screen.queryByText('MAX DRAWDOWN')).toBeNull();
  });

  it('does not show decision adjusted warning for a normal Hold', () => {
    render(<ResultCard result={MOCK_HOLD_RESPONSE} />);

    expect(screen.queryByText('DECISION ADJUSTED')).toBeNull();
    expect(screen.queryByText(/LLM: BUY → FINAL:/)).toBeNull();
  });

  it('shows decision adjusted warning and reason when backend downgrades a decision', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_HOLD_RESPONSE,
          llm_decision: 'Buy',
          decision_adjusted: true,
          decision_adjusted_reason: 'Invalid risk reward structure',
        }}
      />
    );

    expect(screen.getByText('DECISION ADJUSTED')).toBeTruthy();
    expect(screen.getByText('Invalid risk reward structure')).toBeTruthy();
    expect(screen.getByText(/LLM: BUY → FINAL:/)).toBeTruthy();
  });

  it('shows data quality badges and trade plan status', () => {
    render(<ResultCard result={MOCK_REPAIRED_RESPONSE} />);

    expect(screen.getByText('DATA QUALITY')).toBeTruthy();
    expect(screen.getByText('TRADE PLAN: valid')).toBeTruthy();
    expect(screen.getByText('PRICE: ok')).toBeTruthy();
    expect(screen.getByText('TRADE LEVELS: recomputed')).toBeTruthy();
    expect(screen.getByText('LLM OUTPUT: repaired')).toBeTruthy();
  });

  it('shows validation warnings in readable form', () => {
    render(<ResultCard result={MOCK_REPAIRED_RESPONSE} />);

    expect(screen.getByText('Validation Warnings')).toBeTruthy();
    expect(screen.getByText('RR_FORCED_TO_3 - Risk/reward forced to 1:3')).toBeTruthy();
    expect(screen.getByText('TAKE_PROFIT_RECOMPUTED - Take profit recomputed')).toBeTruthy();
  });

  it('does not render action plan for invalid actionable trade plan', () => {
    render(<ResultCard result={{ ...MOCK_RESPONSE, trade_plan_valid: false }} />);

    expect(screen.getByText('TRADE PLAN NOT VALID')).toBeTruthy();
    expect(screen.getByText('TRADE PLAN: not valid')).toBeTruthy();
    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
  });

  it('handles missing current price without rendering NaN or fake levels', () => {
    render(<ResultCard result={MOCK_MISSING_PRICE_RESPONSE} />);

    expect(screen.getByText('PRICE DATA MISSING')).toBeTruthy();
    expect(screen.getByText('PRICE: missing')).toBeTruthy();
    expect(screen.getByText('CURRENT_PRICE_MISSING - Current price missing')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(screen.queryByText('ACTION PLAN')).toBeNull();
    expect(screen.queryByText('ENTRY')).toBeNull();
  });

  it('does not crash when backend sends invalid optional fields', () => {
    expect(() =>
      render(
        <ResultCard
          result={{
            ...MOCK_RESPONSE,
            current_price: Number.NaN,
            price_target: Number.NaN,
            validation_warnings: 'not-an-array',
            data_quality: null,
          }}
        />
      )
    ).not.toThrow();

    expect(screen.getByText('PRICE DATA MISSING')).toBeTruthy();
    expect(screen.queryByText(/NaN/)).toBeNull();
  });

  it('does not render PRICE TARGET even when backend sends price_target field', () => {
    render(
      <ResultCard
        result={{
          ...MOCK_RESPONSE,
          price_target: 1200,
          risk_per_share: 40,
          reward_per_share: 120,
        }}
      />
    );

    expect(screen.queryByText('PRICE TARGET')).toBeNull();
    expect(screen.queryByText('RISK PER SHARE')).toBeNull();
    expect(screen.queryByText('REWARD PER SHARE')).toBeNull();
  });
});
