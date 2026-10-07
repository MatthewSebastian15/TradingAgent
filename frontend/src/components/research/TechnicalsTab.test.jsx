import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TechnicalsTab from './TechnicalsTab';
import { getTechnicals } from '../../api/market';

vi.mock('../../api/market', () => ({ getTechnicals: vi.fn() }));

const technicals = {
  available: true,
  entry_quality: 'Acceptable Entry',
  trend: 'uptrend',
  rsi: 54.56,
  rsi_signal: 'neutral',
  macd: 1.2,
  macd_signal: 'bearish',
  atr: 4.5,
  sma_20: 320.1,
  sma_50: 310.2,
  sma_200: 289.76,
  support: 309.9,
  resistance: 345.34,
  volume_trend: 'rising',
  reasons: ['Price is above the 20-day average.'],
};

describe('TechnicalsTab', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows loading, then the indicator rows and reasons', async () => {
    getTechnicals.mockResolvedValue(technicals);
    render(<TechnicalsTab ticker="AAPL" />);

    expect(screen.getByTestId('technicals-loading')).toBeTruthy();
    expect(await screen.findByText('Acceptable Entry')).toBeTruthy();
    expect(screen.getByText('uptrend')).toBeTruthy();
    expect(screen.getByText('54.56')).toBeTruthy();
    expect(screen.getByText('289.76')).toBeTruthy();
    expect(screen.getByText('309.9')).toBeTruthy();
    expect(screen.getByText('Price is above the 20-day average.')).toBeTruthy();
    expect(getTechnicals).toHaveBeenCalledWith('AAPL', { signal: expect.any(AbortSignal) });
  });

  it('renders N/A for indicators that could not be computed', async () => {
    getTechnicals.mockResolvedValue({ ...technicals, sma_200: null });
    render(<TechnicalsTab ticker="AAPL" />);

    await screen.findByText('Acceptable Entry');
    const sma200 = screen.getByText('SMA 200').parentElement;
    expect(sma200.textContent).toContain('N/A');
  });

  it('explains why there is no data when too little history exists', async () => {
    getTechnicals.mockResolvedValue({
      available: false,
      reasons: ['At least 30 usable OHLCV rows are required.'],
    });
    render(<TechnicalsTab ticker="NEWIPO" />);

    expect(await screen.findByText(/NO TECHNICAL DATA/)).toBeTruthy();
    expect(screen.getByText(/At least 30 usable OHLCV rows/)).toBeTruthy();
  });

  it('shows the error message when the request fails', async () => {
    getTechnicals.mockRejectedValue(new Error('boom'));
    render(<TechnicalsTab ticker="AAPL" />);

    await waitFor(() => expect(screen.getByText(/FAILED TO LOAD: boom/)).toBeTruthy());
  });
});
