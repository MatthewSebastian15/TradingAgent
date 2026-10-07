import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import DividendHistoryList from './DividendHistoryList';
import { getDividendHistory } from '../../api/market';

vi.mock('../../api/market', () => ({ getDividendHistory: vi.fn() }));

describe('DividendHistoryList', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists payments newest first', async () => {
    getDividendHistory.mockResolvedValue({
      ticker: 'AAPL',
      payments: [
        { date: '2026-02-09', amount: 0.26 },
        { date: '2026-05-11', amount: 0.27 },
      ],
    });
    render(<DividendHistoryList ticker="AAPL" />);

    const rows = await screen.findAllByTestId('dividend-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('2026-05-11');
    expect(rows[0].textContent).toContain('0.27');
    expect(rows[1].textContent).toContain('2026-02-09');
    expect(getDividendHistory).toHaveBeenCalledWith('AAPL', { signal: expect.any(AbortSignal) });
  });

  it('says so when the company has never paid a dividend', async () => {
    getDividendHistory.mockResolvedValue({ ticker: 'TSLA', payments: [] });
    render(<DividendHistoryList ticker="TSLA" />);

    expect(await screen.findByText(/NO DIVIDEND HISTORY/)).toBeTruthy();
  });

  it('stays silent when the request fails and without a ticker', async () => {
    getDividendHistory.mockClear();
    getDividendHistory.mockRejectedValue(new Error('boom'));
    const failed = render(<DividendHistoryList ticker="AAPL" />);
    await vi.waitFor(() => expect(getDividendHistory).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
    expect(failed.container.querySelector('[data-testid="dividend-history"]')).toBeNull();
    expect(screen.queryByText(/NO DIVIDEND HISTORY/)).toBeNull();
    failed.unmount();

    const calls = getDividendHistory.mock.calls.length;
    const idle = render(<DividendHistoryList />);
    expect(getDividendHistory.mock.calls.length).toBe(calls);
    expect(idle.container.firstChild).toBeNull();
  });
});
