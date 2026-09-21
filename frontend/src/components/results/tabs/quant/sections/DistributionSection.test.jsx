import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DistributionSection } from './DistributionSection';
import { returnHistogram } from '../../quantUtils';

describe('DistributionSection', () => {
  afterEach(() => cleanup());

  it('marks VaR levels on an axis-labeled histogram', () => {
    const returns = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 0.02);
    const { container } = render(
      <DistributionSection
        skew={-0.2}
        kurt={1.5}
        var95={-1.8}
        var99={-1.95}
        bins={returnHistogram(returns, 30)}
        mu={0}
        sigma={0.014}
      />
    );
    const chart = screen.getByRole('img', {
      name: 'Histogram of daily returns with a fitted normal overlay',
    });
    expect(chart).toBeTruthy();
    // Marker labels render as SVG text inside the chart.
    expect(chart.querySelectorAll('text').length).toBeGreaterThan(0);
    expect(screen.getByText('VaR 95%')).toBeTruthy();
    expect(screen.getByText('VaR 99%')).toBeTruthy();
    // VaR 99% is a worse (more negative) return, so its marker sits left of VaR 95%.
    const x = (label) => Number(screen.getByText(label).getAttribute('x'));
    expect(x('VaR 99%')).toBeLessThan(x('VaR 95%'));
    expect(screen.getByText('Normal fit')).toBeTruthy();
    expect(screen.getAllByText(/%$/).length).toBeGreaterThan(2);
    // The fitted-normal overlay is the only stroked, unfilled path in the plot.
    expect(container.querySelector('path[fill="none"][stroke]')).toBeTruthy();
  });
});
