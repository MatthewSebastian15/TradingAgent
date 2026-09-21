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
  afterEach(async () => {
    cleanup();
    // Tests below swap the OHLCV mock; restore the default so a failure cannot leak it.
    const { getMarketOhlcv } = await import('../../../api/market');
    getMarketOhlcv.mockImplementation(async () => ({ points: [] }));
  });

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

  it('does not extend history and fetches the benchmark with the explicit range', async () => {
    const { getMarketOhlcv } = await import('../../../api/market');
    getMarketOhlcv.mockClear();
    await renderPanel({ points: buildPoints(40), range: '3M', sections: ['volatility'] });

    const tickerCalls = getMarketOhlcv.mock.calls.filter(([sym]) => sym === 'AAPL');
    expect(tickerCalls).toHaveLength(0);
    expect(getMarketOhlcv).toHaveBeenCalledWith('^GSPC', expect.objectContaining({ range: '3M' }));
  });

  it('does not leak valuation inputs from the previous ticker after a symbol change', async () => {
    const { getStockOverview } = await import('../../../api/market');
    getStockOverview.mockResolvedValueOnce({
      free_cashflow: 2e9,
      shares_outstanding: 1e8,
      total_debt: 5e8,
      total_cash: 1e8,
      earnings_growth: 0.12,
    });
    getStockOverview.mockReturnValueOnce(new Promise(() => {})); // next ticker never resolves
    const props = { points: buildPoints(40), sections: ['valuation'] };
    const { rerender } = render(<QuantPanel currency="USD" symbol="AAPL" {...props} />);
    await act(async () => {});
    expect(screen.getByLabelText(/Base FCF/).value).toBe('2000');

    rerender(<QuantPanel currency="USD" symbol="MSFT" {...props} />);
    await act(async () => {});

    expect(screen.getByLabelText(/Base FCF/).value).toBe('');
    expect(screen.queryByText('Fair Value / Share')).toBeNull();
  });

  it('clears the typed peer text when the range changes', async () => {
    const props = { points: buildPoints(40), sections: ['correlation'], currency: 'USD' };
    const { rerender } = render(<QuantPanel symbol="AAPL" range="1Y" {...props} />);
    await act(async () => {});
    const input = screen.getByPlaceholderText(/Add peers/);
    fireEvent.change(input, { target: { value: 'MSFT' } });
    expect(input.value).toBe('MSFT');

    rerender(<QuantPanel symbol="AAPL" range="3M" {...props} />);
    await act(async () => {});
    expect(screen.getByPlaceholderText(/Add peers/).value).toBe('');
  });

  it('derives Last and Window from rows with a usable price, falling back to close', async () => {
    const pts = [
      ...buildPoints(40),
      { date: '2026-02-14', close: 111.5, adjusted_close: NaN },
      { date: '2026-02-15', close: null, adjusted_close: NaN },
    ];
    await renderPanel({ points: pts, sections: ['volatility'] });

    expect(screen.getByText('USD 111.50')).toBeTruthy();
    expect(screen.getByText('2026-01-01 → 2026-02-14 · 41 obs')).toBeTruthy();
  });

  it('clears peers and the typed peer text when the base symbol changes', async () => {
    const { getMarketOhlcv } = await import('../../../api/market');
    getMarketOhlcv.mockImplementation(async (sym) =>
      sym === 'MSFT' ? { points: buildPoints(40) } : { points: [] }
    );
    const props = { points: buildPoints(40), sections: ['correlation'], currency: 'USD' };
    const { rerender } = render(<QuantPanel symbol="AAPL" range="1Y" {...props} />);
    await act(async () => {});
    const input = screen.getByPlaceholderText(/Add peers/);
    fireEvent.change(input, { target: { value: 'MSFT' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));
    await act(async () => {});
    expect(screen.getAllByText('MSFT').length).toBeGreaterThan(0);
    fireEvent.change(screen.getByPlaceholderText(/Add peers/), { target: { value: 'NVDA' } });

    rerender(<QuantPanel symbol="GOOG" range="1Y" {...props} />);
    await act(async () => {});
    expect(screen.queryAllByText('MSFT')).toHaveLength(0);
    expect(screen.getByPlaceholderText(/Add peers/).value).toBe('');
    getMarketOhlcv.mockImplementation(async () => ({ points: [] }));
  });

  it('ignores a peer response that lands after the base symbol changed', async () => {
    const { getMarketOhlcv } = await import('../../../api/market');
    let resolvePeer;
    getMarketOhlcv.mockImplementation((sym) =>
      sym === 'MSFT'
        ? new Promise((resolve) => {
            resolvePeer = resolve;
          })
        : Promise.resolve({ points: [] })
    );
    const props = { points: buildPoints(40), sections: ['correlation'], currency: 'USD' };
    const { rerender } = render(<QuantPanel symbol="AAPL" range="1Y" {...props} />);
    await act(async () => {});
    fireEvent.change(screen.getByPlaceholderText(/Add peers/), { target: { value: 'MSFT' } });
    fireEvent.click(screen.getByRole('button', { name: /add/i }));

    rerender(<QuantPanel symbol="GOOG" range="1Y" {...props} />);
    await act(async () => {});
    await act(async () => {
      resolvePeer({ points: buildPoints(40) });
    });

    expect(screen.queryAllByText('MSFT')).toHaveLength(0);
    getMarketOhlcv.mockImplementation(async () => ({ points: [] }));
  });

  it('keeps Last, Window and Period change on the last valid row when edge closes are non-positive', async () => {
    const good = buildPoints(40);
    const pts = [
      ...good,
      { date: '2026-02-14', close: 0, adjusted_close: 0 },
      { date: '2026-02-15', close: -5, adjusted_close: -5 },
    ];
    await renderPanel({ points: pts, sections: ['volatility'] });

    const last = good.at(-1);
    expect(screen.getByText(`USD ${last.close.toFixed(2)}`)).toBeTruthy();
    expect(screen.getByText(`2026-01-01 → ${last.date} · 40 obs`)).toBeTruthy();
    const expected = (last.close / good[0].close - 1) * 100;
    expect(screen.getByText('Period Δ').nextSibling.textContent).toBe(`+${expected.toFixed(1)}%`);
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

  it('uses the market risk-free rate from /api/status', async () => {
    const { getApiStatus } = await import('../../../api/market');
    getApiStatus.mockResolvedValueOnce({ quant_risk_free_rates: { US: 0.05 } });
    await renderPanel({ points: buildPoints(40), sections: ['risk'] });

    expect(screen.getAllByText(/excess over 5\.0%/).length).toBeGreaterThan(0);
  });

  it('falls back to the global risk-free rate when the market has none', async () => {
    const { getApiStatus } = await import('../../../api/market');
    getApiStatus.mockResolvedValueOnce({
      quant_risk_free_rate: 0.03,
      quant_risk_free_rates: { JK: 0.06 },
    });
    await renderPanel({ points: buildPoints(40), sections: ['risk'] });

    expect(screen.getAllByText(/excess over 3\.0%/).length).toBeGreaterThan(0);
    expect(screen.getByText('global default')).toBeTruthy();
  });

  it('lets a market rate of 0 beat the global default', async () => {
    const { getApiStatus } = await import('../../../api/market');
    getApiStatus.mockResolvedValueOnce({
      quant_risk_free_rate: 0.03,
      quant_risk_free_rates: { US: 0 },
    });
    await renderPanel({ points: buildPoints(40), sections: ['risk'] });

    expect(screen.getAllByText(/excess over 0\.0%/).length).toBeGreaterThan(0);
    expect(screen.getByText('market default')).toBeTruthy();
  });

  it('clearing the manual risk-free rate returns to the market default', async () => {
    const { getApiStatus } = await import('../../../api/market');
    getApiStatus.mockResolvedValueOnce({ quant_risk_free_rates: { US: 0.05 } });
    await renderPanel({ points: buildPoints(40), sections: ['risk'] });
    const input = screen.getByLabelText('Risk-free rate, annual percent');

    fireEvent.change(input, { target: { value: '2' } });
    expect(screen.getByText('manual')).toBeTruthy();
    expect(screen.getAllByText(/excess over 2\.0%/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /reset risk-free/i }));
    expect(screen.getByText('market default')).toBeTruthy();
    expect(input.value).toBe('5');

    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.change(input, { target: { value: '' } });
    expect(screen.getByText('market default')).toBeTruthy();
    expect(input.value).toBe('');
  });

  it('computes the period change from the first and last finite positive closes', async () => {
    const good = buildPoints(40);
    const bad = [{ date: '2025-12-31', close: 0 }, ...good];
    await renderPanel({ points: bad, sections: ['volatility'] });

    const expected = (good.at(-1).close / good[0].close - 1) * 100;
    const text = screen.getByText('Period Δ').nextSibling.textContent;
    expect(text).toBe(`+${expected.toFixed(1)}%`);
  });
});
