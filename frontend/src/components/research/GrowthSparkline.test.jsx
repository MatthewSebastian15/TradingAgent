import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import GrowthSparkline from './GrowthSparkline';
import { getGrowthTrend } from '../../api/market';

vi.mock('../../api/market', () => ({ getGrowthTrend: vi.fn() }));

const quarters = [
  { period: '2025-09-30', revenue: 100e9, earnings: 20e9 },
  { period: '2025-12-31', revenue: 120e9, earnings: -5e9 },
  { period: '2026-03-31', revenue: 110e9, earnings: null },
];

describe('GrowthSparkline', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('draws a revenue and an earnings bar per quarter and labels the latest value', async () => {
    getGrowthTrend.mockResolvedValue({ ticker: 'AAPL', quarters });
    render(<GrowthSparkline ticker="AAPL" />);

    expect(await screen.findByTestId('growth-sparkline')).toBeTruthy();
    expect(screen.getAllByTestId('growth-bar-revenue')).toHaveLength(3);
    // the null earnings quarter has no bar
    expect(screen.getAllByTestId('growth-bar-earnings')).toHaveLength(2);
    expect(screen.getByText('110B')).toBeTruthy(); // latest revenue, compact
    expect(getGrowthTrend).toHaveBeenCalledWith('AAPL', { signal: expect.any(AbortSignal) });
  });

  it('scales bars against the largest value and colours losses red', async () => {
    getGrowthTrend.mockResolvedValue({ quarters });
    render(<GrowthSparkline ticker="AAPL" />);
    await screen.findByTestId('growth-sparkline');

    const revenue = screen
      .getAllByTestId('growth-bar-revenue')
      .map((r) => Number(r.getAttribute('height')));
    expect(revenue[1]).toBeGreaterThan(revenue[0]); // 120 > 100
    expect(Math.max(...revenue)).toBeGreaterThan(0);
    const earnings = screen.getAllByTestId('growth-bar-earnings');
    expect(earnings[0].getAttribute('class')).toContain('fill-bloomberg-green');
    expect(earnings[1].getAttribute('class')).toContain('fill-bloomberg-red');
  });

  it('renders nothing for fewer than two quarters, on failure and without a ticker', async () => {
    getGrowthTrend.mockClear();
    getGrowthTrend.mockResolvedValueOnce({ quarters: [quarters[0]] });
    const one = render(<GrowthSparkline ticker="AAPL" />);
    await vi.waitFor(() => expect(getGrowthTrend).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 0));
    expect(one.container.querySelector('[data-testid="growth-sparkline"]')).toBeNull();
    one.unmount();

    getGrowthTrend.mockRejectedValueOnce(new Error('boom'));
    const failed = render(<GrowthSparkline ticker="AAPL" />);
    await vi.waitFor(() => expect(getGrowthTrend).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 0));
    expect(failed.container.querySelector('[data-testid="growth-sparkline"]')).toBeNull();
    failed.unmount();

    const idle = render(<GrowthSparkline />);
    expect(getGrowthTrend).toHaveBeenCalledTimes(2);
    expect(idle.container.firstChild).toBeNull();
  });
});
