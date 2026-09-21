import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { StochasticSection } from './StochasticSection';
import { monteCarloGBM, returnHistogram } from '../../quantUtils';

describe('StochasticSection', () => {
  afterEach(() => cleanup());

  it('renders the fan chart with a Today reference line and legend', () => {
    const sim = monteCarloGBM(100, 0.0005, 0.02, 21, 300, 1);
    render(
      <StochasticSection
        sim={sim}
        spot={100}
        ccy="USD"
        seed={1}
        onReroll={vi.fn()}
        onSeedChange={vi.fn()}
        returnBins={returnHistogram([0.01, -0.01, 0.02, -0.02], 4)}
        horizon={21}
        onHorizonChange={vi.fn()}
        horizonLabel="~1mo"
        method="gbm"
        onMethodChange={vi.fn()}
        drift="historical"
        onDriftChange={vi.fn()}
      />
    );
    const fan = screen.getByRole('img', { name: 'Monte Carlo price fan chart' });
    // The dashed 'Today' reference line at spot lives inside the plot.
    expect(fan.querySelector('line[stroke-dasharray]')).toBeTruthy();
    expect(screen.getAllByText('Today').length).toBeGreaterThan(0);
    expect(screen.getByText('P10–P90')).toBeTruthy();
    expect(screen.getByText('Median')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Re-roll' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Histogram of simulated ~1mo prices' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Histogram of historical daily returns' })).toBeTruthy();
  });
});
