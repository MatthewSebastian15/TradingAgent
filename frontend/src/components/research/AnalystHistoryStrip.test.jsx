import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AnalystHistoryStrip from './AnalystHistoryStrip';
import { getAnalystHistory } from '../../api/market';

vi.mock('../../api/market', () => ({ getAnalystHistory: vi.fn() }));

const history = [
  { period: '-1m', strong_buy: 5, buy: 18, hold: 14, sell: 3, strong_sell: 2 },
  { period: '0m', strong_buy: 6, buy: 19, hold: 13, sell: 3, strong_sell: 3 },
];

describe('AnalystHistoryStrip', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders one stacked bar per period, sized by share of analysts', async () => {
    getAnalystHistory.mockResolvedValue({ ticker: 'AAPL', history });
    render(<AnalystHistoryStrip ticker="AAPL" />);

    const strip = await screen.findByTestId('analyst-history-strip');
    expect(strip).toBeTruthy();
    expect(screen.getAllByTestId('analyst-history-row')).toHaveLength(2);
    expect(screen.getByText('NOW')).toBeTruthy();
    expect(screen.getByText('-1M')).toBeTruthy();
    // 0m: 6 strong buy out of 44 analysts = 13.64%
    const segment = screen.getAllByTitle('Strong Buy 6')[0];
    expect(parseFloat(segment.style.width)).toBeCloseTo(13.64, 1);
    expect(getAnalystHistory).toHaveBeenCalledWith('AAPL', { signal: expect.any(AbortSignal) });
  });

  it('renders nothing when there is no analyst coverage', async () => {
    getAnalystHistory.mockResolvedValue({ ticker: 'TINY', history: [] });
    const { container } = render(<AnalystHistoryStrip ticker="TINY" />);

    await vi.waitFor(() => expect(getAnalystHistory).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="analyst-history-strip"]')).toBeNull();
  });

  it('stays silent when the request fails (card must not break)', async () => {
    getAnalystHistory.mockRejectedValue(new Error('boom'));
    const { container } = render(<AnalystHistoryStrip ticker="AAPL" />);

    await vi.waitFor(() => expect(getAnalystHistory).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('[data-testid="analyst-history-strip"]')).toBeNull();
  });

  it('does not fetch without a ticker', () => {
    getAnalystHistory.mockClear();
    const { container } = render(<AnalystHistoryStrip />);

    expect(getAnalystHistory).not.toHaveBeenCalled();
    expect(container.firstChild).toBeNull();
  });

  it('survives a period where every count is zero', async () => {
    getAnalystHistory.mockResolvedValue({
      history: [{ period: '0m', strong_buy: 0, buy: 0, hold: 0, sell: 0, strong_sell: 0 }],
    });
    render(<AnalystHistoryStrip ticker="AAPL" />);

    expect(await screen.findByTestId('analyst-history-strip')).toBeTruthy();
  });
});
