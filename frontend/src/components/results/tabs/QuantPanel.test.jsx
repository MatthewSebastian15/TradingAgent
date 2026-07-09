import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import QuantPanel from './QuantPanel';

vi.mock('../../../api/market', () => ({
  getApiStatus: vi.fn(async () => ({})),
  getMarketOhlcv: vi.fn(async () => ({ points: [] })),
  getStockOverview: vi.fn(async () => ({})),
}));

function buildPoints(count) {
  return Array.from({ length: count }, (_, i) => {
    const day = String((i % 27) + 1).padStart(2, '0');
    const month = String(Math.floor(i / 27) + 1).padStart(2, '0');
    // Deterministic wiggle so returns are non-constant.
    const close = 100 + (i % 7) - 3 + i * 0.1;
    return { date: `2026-${month}-${day}`, close, adjusted_close: close };
  });
}

async function renderPanel(props) {
  render(<QuantPanel points={[]} currency="USD" symbol="AAPL" {...props} />);
  // Flush the mocked status/benchmark fetch effects.
  await act(async () => {});
}

describe('QuantPanel', () => {
  afterEach(() => cleanup());

  it('shows the loading skeleton when no points have streamed in yet', async () => {
    await renderPanel({ points: [] });

    expect(document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('shows the short-history notice below 30 trading days', async () => {
    await renderPanel({ points: buildPoints(10) });

    expect(screen.getByText('Not enough data')).toBeTruthy();
    expect(screen.getByText(/at least 30 trading days/)).toBeTruthy();
  });

  it('shows the no-tabs notice when sections is an empty array', async () => {
    await renderPanel({ points: buildPoints(40), sections: [] });

    expect(screen.getByText('No tabs selected')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Volatility' })).toBeNull();
  });

  it('shows one tab per requested section and switches the active panel on click', async () => {
    await renderPanel({ points: buildPoints(40), sections: ['volatility', 'sizing'] });

    expect(screen.getByRole('tab', { name: 'Volatility' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sizing' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Risk' })).toBeNull();
    expect(screen.queryByRole('tab', { name: 'Backtest' })).toBeNull();

    // First tab is active; the other panel is mounted but hidden.
    expect(screen.getByRole('heading', { name: 'Volatility' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Sizing' })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'Sizing' }));
    expect(screen.getByRole('heading', { name: 'Sizing' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Volatility' })).toBeNull();
  });

  it('uses the fetched long history when it is longer than the prop series', async () => {
    const { getMarketOhlcv } = await import('../../../api/market');
    getMarketOhlcv.mockResolvedValueOnce({ points: buildPoints(60) });
    await renderPanel({ points: buildPoints(10), sections: ['volatility'] });

    expect(getMarketOhlcv).toHaveBeenCalledWith('AAPL', expect.objectContaining({ range: '2Y' }));
    // 10 prop points alone would show the short-history notice; 60 fetched points render sections.
    expect(screen.queryByText('Not enough data')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Volatility' })).toBeTruthy();
  });

  it('renders every tab when sections is undefined', async () => {
    await renderPanel({ points: buildPoints(40) });

    for (const title of [
      'Volatility',
      'Risk',
      'Distribution',
      'Stochastic',
      'Backtest',
      'Sizing',
      'Correlation',
      'Options',
      'Valuation',
      'Scenario',
    ]) {
      expect(screen.getByRole('tab', { name: title })).toBeTruthy();
    }
  });
});
