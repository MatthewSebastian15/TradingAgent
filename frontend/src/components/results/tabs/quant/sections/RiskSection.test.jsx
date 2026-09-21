import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { RiskSection } from './RiskSection';

const baseProps = {
  dd: -20,
  cal: 0.5,
  histVaR: -2,
  paramVaR: -2.1,
  cfVaR: -2.4,
  cv: -3,
  downDev: 12,
  shp: 0.8,
  srt: 1.1,
  bta: 1.1,
  alf: 2,
  rfPct: 4,
  obs: 500,
  benchObs: 500,
  benchAvailable: true,
  benchLabel: 'S&P 500',
  ddPoints: [],
  rsPoints: [],
  rbPoints: [],
  ddStats: {
    maxDD: -20,
    maxDDDuration: 40,
    maxDDRecovered: true,
    recoveryDays: 12,
    currentUnderwaterDays: 0,
    episodes: 2,
  },
};

describe('RiskSection', () => {
  afterEach(() => cleanup());

  it('renders the Max Drawdown card exactly once', () => {
    render(<RiskSection {...baseProps} />);
    expect(screen.getAllByText('Max Drawdown')).toHaveLength(1);
  });

  it('shows the real annualization factor in the formulas', () => {
    render(<RiskSection {...baseProps} ppy={365} />);
    expect(screen.getAllByText(/√365/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/√252/)).toBeNull();
  });

  it('labels beta with its aligned sample size', () => {
    render(<RiskSection {...baseProps} obs={500} benchObs={60} />);
    expect(screen.getAllByText('n=60 · low confidence').length).toBeGreaterThan(0);
  });
});
