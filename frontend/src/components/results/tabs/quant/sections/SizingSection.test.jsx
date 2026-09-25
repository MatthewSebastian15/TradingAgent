import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SizingSection } from './SizingSection';

const baseProps = {
  kelly: { full: 2.4, lowerBound: 0.8, standardError: 0.001 },
  forecastVol: 50,
  forecastSource: 'GARCH 21d',
  volTarget: 15,
  onVolTargetChange: vi.fn(),
  regime: { label: 'Normal', tone: 'neutral' },
  hurstInfo: { hurst: 0.52, standardError: 0.04, significant: false, windows: 6 },
  adf: { tStat: -1.2, stationaryAt5: false, critical: { '5%': -2.86 } },
  ouHL: 12,
  spot: 9000,
  ccy: 'IDR',
  symbol: 'BBCA.JK',
  dailySigma: 0.0125,
};

describe('SizingSection', () => {
  afterEach(() => cleanup());

  it('suggests min(half of the Kelly lower bound, vol-target weight)', () => {
    render(<SizingSection {...baseProps} />);
    expect(screen.getByTestId('suggested-position').textContent).toBe('30%');
  });

  it('hides the half-life when ADF does not reject a unit root', () => {
    render(<SizingSection {...baseProps} />);
    expect(screen.getByText(/unit root not rejected/)).toBeTruthy();
    expect(screen.getByText('No clear persistence')).toBeTruthy();
  });

  it('sizes an IDX position in lots of 100', () => {
    render(<SizingSection {...baseProps} />);
    fireEvent.change(screen.getByLabelText(/Capital/), { target: { value: '100000000' } });
    fireEvent.change(screen.getByLabelText(/Stop/), { target: { value: '8550' } });
    expect(screen.getByText('22')).toBeTruthy();
    expect(screen.getByText('Lot size: 100 shares')).toBeTruthy();
  });
});
