import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { VolatilitySection } from './VolatilitySection';

const dates = Array.from({ length: 40 }, (_, i) =>
  new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)
);
const points = (base) => dates.map((date, i) => ({ date, value: base + Math.sin(i) }));

const props = {
  vol: 24,
  ewma: 26,
  ppy: 252,
  estimators: { parkinson: 20, garmanKlass: 21, yangZhang: 23 },
  cone: [
    { window: 10, min: 10, p25: 15, median: 20, p75: 26, max: 50, current: 30, percentile: 80 },
    { window: 21, min: 12, p25: 16, median: 21, p75: 25, max: 40, current: 28, percentile: 82 },
  ],
  garch: { alpha: 0.08, beta: 0.9, persistence: 0.98, longRunVariance: 0.0002, observations: 500 },
  garchTerm: [
    { days: 5, annualVol: 29 },
    { days: 21, annualVol: 27 },
  ],
  rollingPoints: points(20),
  rolling63Points: points(22),
  ewmaPoints: points(25),
};

describe('VolatilitySection', () => {
  afterEach(() => cleanup());

  it('shows the annualization factor in the formula text', () => {
    const { container, rerender } = render(<VolatilitySection {...props} ppy={365} />);
    expect(container.textContent).toContain('√365');
    rerender(<VolatilitySection {...props} ppy={undefined} />);
    expect(container.textContent).toContain('√252');
  });

  it('lists every estimator including the GARCH 1M forecast', () => {
    render(<VolatilitySection {...props} />);
    for (const name of [
      'Close-to-close',
      'EWMA (λ = 0.94)',
      'Parkinson',
      'Garman-Klass',
      'Yang-Zhang',
      'GARCH(1,1) · next 21d',
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
    // 27.0% also appears in the term-structure table, so scope it to the estimator row.
    const garchRow = screen.getByText('GARCH(1,1) · next 21d').closest('tr');
    expect(garchRow.textContent).toContain('27.0%');
  });

  it('shows a dash for range estimators when OHLC data is unavailable', () => {
    render(<VolatilitySection {...props} estimators={{}} />);
    const row = screen.getByText('Parkinson').closest('tr');
    expect(row.textContent).toContain('—');
  });

  it('draws the rolling chart with 21d, 63d and EWMA legend entries and the vol cone', () => {
    render(<VolatilitySection {...props} />);
    expect(screen.getByText('21-day')).toBeTruthy();
    expect(screen.getByText('63-day')).toBeTruthy();
    expect(screen.getByText('EWMA')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Volatility cone' })).toBeTruthy();
    expect(screen.getByText('Volatility cone · realized vol by window')).toBeTruthy();
  });

  it('shows the term-structure gap to the long-run vol with an explicit sign', () => {
    render(<VolatilitySection {...props} />);
    // long run = sqrt(0.0002 * 252) * 100 = 22.4%: 29% is +6.6 pts, 27% is +4.6 pts.
    expect(screen.getByText('+6.6 pts')).toBeTruthy();
    expect(screen.getByText('+4.6 pts')).toBeTruthy();
  });

  it('explains when GARCH is unavailable', () => {
    render(<VolatilitySection {...props} garch={null} garchTerm={[]} />);
    expect(screen.getByText(/needs at least 100 daily returns/)).toBeTruthy();
  });
});
