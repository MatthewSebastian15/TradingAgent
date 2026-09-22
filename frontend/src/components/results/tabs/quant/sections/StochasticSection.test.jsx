import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StochasticSection } from './StochasticSection';
import { monteCarloGBM, returnHistogram } from '../../quantUtils';

const handlers = {
  onReroll: vi.fn(),
  onSeedChange: vi.fn(),
  onHorizonChange: vi.fn(),
  onMethodChange: vi.fn(),
  onDriftChange: vi.fn(),
  onBootDemeanChange: vi.fn(),
  onTargetChange: vi.fn(),
  onStopChange: vi.fn(),
};

const baseProps = {
  ...handlers,
  sim: monteCarloGBM(100, 0.0005, 0.02, 21, 400, 1, { target: 110, stop: 90 }),
  running: false,
  spot: 100,
  ccy: 'USD',
  lastDate: '2026-09-11',
  ppy: 252,
  seed: 1,
  horizon: 21,
  horizonLabel: '~1mo',
  method: 'gbm',
  drift: 'historical',
  bootDemean: false,
  target: 110,
  stop: 90,
  sigmaInfo: { sigma: 0.02, source: 'garch' },
  returnBins: returnHistogram([0.01, -0.01, 0.02, -0.02], 4),
};

describe('StochasticSection', () => {
  afterEach(() => cleanup());

  it('shows probabilities, the outcome table and a dated fan chart', () => {
    render(<StochasticSection {...baseProps} />);
    expect(screen.getByText('P(touch target)')).toBeTruthy();
    expect(screen.getByText('P(touch stop)')).toBeTruthy();
    expect(screen.getByText('P95')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Monte Carlo price fan chart' })).toBeTruthy();
    expect(screen.getByText('P5–P95')).toBeTruthy();
    expect(screen.getByText(/GARCH forecast averaged over the horizon/)).toBeTruthy();
  });

  it('announces a running simulation', () => {
    render(<StochasticSection {...baseProps} running />);
    expect(screen.getByRole('status').textContent).toContain('Simulating');
  });

  it('shows the demean toggle only for bootstrap', () => {
    const { rerender } = render(<StochasticSection {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Demeaned' })).toBeNull();
    rerender(<StochasticSection {...baseProps} method="bootstrap" />);
    expect(screen.getByRole('button', { name: 'Demeaned' })).toBeTruthy();
  });
});
