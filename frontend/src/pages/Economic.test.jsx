import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Economic from './Economic';

vi.mock('../hooks/useEconomicData', () => ({
  useEconomicData: vi.fn(() => ({ loading: false, error: null, data: null })),
}));

describe('Economic page', () => {
  afterEach(() => cleanup());

  it('renders the heading, gauges strip, and default rates panel', () => {
    render(<Economic />);

    expect(screen.getByRole('heading', { name: 'Economic' })).toBeTruthy();
    for (const gauge of ['DXY', 'VIX', 'WTI', 'Brent', 'Gold']) {
      expect(screen.getByText(gauge)).toBeTruthy();
    }
    expect(screen.getByText(/Source: Federal Reserve/)).toBeTruthy();
  });

  it('switches sub-tabs', () => {
    render(<Economic />);

    fireEvent.click(screen.getByRole('button', { name: 'GROWTH' }));
    expect(screen.getByText('Source: World Bank + IMF WEO')).toBeTruthy();
    expect(screen.queryByText(/Source: Federal Reserve/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'INFLATION' }));
    expect(screen.getByText('Source: World Bank CPI + ECB HICP')).toBeTruthy();
  });

  it('shows the unavailable banner when a rates source errors', async () => {
    const { useEconomicData } = await import('../hooks/useEconomicData');
    useEconomicData.mockReturnValue({ loading: false, error: 'boom', data: null });
    render(<Economic />);

    expect(screen.getByText('Economic data unavailable')).toBeTruthy();
  });
});
