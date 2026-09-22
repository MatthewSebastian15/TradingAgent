import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DistributionSection } from './DistributionSection';
import {
  histogramBins,
  jarqueBera,
  normInv,
  qqPoints,
  returnsByMonth,
  returnsByWeekday,
} from '../../quantUtils';

const returns = Array.from({ length: 400 }, (_, i) => 0.01 * normInv((i + 0.5) / 400));
const points = returns.reduce(
  (acc, r, i) => [
    ...acc,
    {
      date: new Date(Date.UTC(2025, 0, 2 + i)).toISOString().slice(0, 10),
      close: acc.at(-1).close * (1 + r),
    },
  ],
  [{ date: '2025-01-01', close: 100 }]
);

describe('DistributionSection', () => {
  afterEach(() => cleanup());

  it('shows markers, Jarque-Bera, a QQ plot and seasonality tables', () => {
    render(
      <DistributionSection
        skew={0}
        kurt={0}
        var95={-1.6}
        var99={-2.3}
        cvar95={-2.0}
        histogram={histogramBins(returns)}
        mu={0}
        sigma={0.01}
        jb={jarqueBera(returns)}
        qq={qqPoints(returns)}
        weekday={returnsByWeekday(points)}
        month={returnsByMonth(points)}
      />
    );
    expect(screen.getByText('VaR 95%')).toBeTruthy();
    expect(screen.getByText('CVaR 95%')).toBeTruthy();
    expect(screen.getByText('Jarque-Bera p-value')).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'QQ plot against the normal distribution' })
    ).toBeTruthy();
    expect(screen.getByText('Returns by weekday')).toBeTruthy();
    expect(screen.getByText('Mon')).toBeTruthy();
  });

  it('keeps every QQ point when the sample is smaller than the downsample cap', () => {
    const smallReturns = [0.01, -0.02, 0.015, -0.005, 0.02, -0.01, 0.008, -0.003, 0.012, -0.018];
    const qq = qqPoints(smallReturns);
    const { container } = render(
      <DistributionSection
        skew={0}
        kurt={0}
        var95={-1.6}
        var99={-2.3}
        cvar95={-2.0}
        histogram={histogramBins(smallReturns)}
        mu={0}
        sigma={0.01}
        jb={jarqueBera(smallReturns)}
        qq={qq}
        weekday={[]}
        month={[]}
      />
    );
    const chart = screen.getByRole('img', { name: 'QQ plot against the normal distribution' });
    expect(chart.querySelectorAll('circle').length).toBe(qq.length);
    expect(container).toBeTruthy();
  });

  it('shows a dash for skew/kurt/JB when history is too short for Jarque-Bera', () => {
    const shortReturns = [0.01, -0.005, 0.008, -0.002, 0.003];
    render(
      <DistributionSection
        skew={0}
        kurt={0}
        var95={-1.6}
        var99={-2.3}
        cvar95={-2.0}
        histogram={histogramBins(shortReturns)}
        mu={0}
        sigma={0.01}
        jb={jarqueBera(shortReturns)}
        qq={qqPoints(shortReturns)}
        weekday={[]}
        month={[]}
      />
    );
    expect(screen.getByText('Jarque-Bera p-value')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });
});
