import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import HomeEconomicSummary from './HomeEconomicSummary';

vi.mock('../../hooks/useEconomicData', () => ({
  useEconomicData: vi.fn((source, dataset) => {
    if (dataset === 'yield_curve') {
      return {
        loading: false,
        error: null,
        data: {
          data: [
            { date: '3 Mo', value: 5.1 },
            { date: '10 Yr', value: 4.25 },
          ],
        },
      };
    }
    if (dataset === 'gauges') {
      return {
        loading: false,
        error: null,
        data: { series: { DXY: [{ date: 'd', value: 104.456 }] } },
      };
    }
    if (dataset === 'gdp_growth') {
      return {
        loading: false,
        error: null,
        data: {
          series: {
            USA: [
              { date: '2023', value: 2.5 },
              { date: '2024', value: 2.8 },
            ],
          },
        },
      };
    }
    // cpi → error path
    return { loading: false, error: 'boom', data: null };
  }),
}));

describe('HomeEconomicSummary', () => {
  afterEach(() => cleanup());

  it('renders the four metric cards from their datasets', () => {
    render(<HomeEconomicSummary />);

    expect(screen.getByText('Treasury Curve')).toBeTruthy();
    expect(screen.getByText('5.10%')).toBeTruthy();
    expect(screen.getByText('4.25%')).toBeTruthy();
    expect(screen.getByText('Macro Gauges')).toBeTruthy();
    expect(screen.getByText('104.46')).toBeTruthy();
    // Annual rows show newest year first.
    expect(screen.getByText('US Growth')).toBeTruthy();
    expect(screen.getByText('2.80%')).toBeTruthy();
    // CPI card fell over → alert.
    expect(screen.getByRole('alert').textContent).toContain('Unavailable.');
  });

  it('collapses and expands the whole section', () => {
    render(<HomeEconomicSummary />);
    const toggle = screen.getByRole('button', { name: /Economics/ });

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Treasury Curve')).toBeNull();

    fireEvent.click(toggle);
    expect(screen.getByText('Treasury Curve')).toBeTruthy();
  });

  it('shows unset points as an em dash', () => {
    render(<HomeEconomicSummary />);

    // 2 Yr and 30 Yr are absent from the curve fixture.
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });
});
