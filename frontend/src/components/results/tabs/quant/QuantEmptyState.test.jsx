import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUICK_TICKERS, QuantEmptyState } from './QuantEmptyState';

describe('QuantEmptyState', () => {
  afterEach(() => cleanup());

  it('offers quick and recent tickers and explains the page', () => {
    const onPick = vi.fn();
    render(<QuantEmptyState onPick={onPick} recent={['GOTO.JK', 'AAPL']} />);

    expect(screen.getByText(/Search a ticker or load a past analysis/)).toBeTruthy();
    const quick = screen.getByRole('group', { name: 'Try a ticker' });
    expect(
      within(quick)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(QUICK_TICKERS);
    fireEvent.click(within(quick).getByRole('button', { name: 'BBRI.JK' }));
    expect(onPick).toHaveBeenCalledWith('BBRI.JK');

    const recent = screen.getByRole('group', { name: 'Recent tickers' });
    fireEvent.click(within(recent).getByRole('button', { name: 'GOTO.JK' }));
    expect(onPick).toHaveBeenLastCalledWith('GOTO.JK');

    expect(screen.getByText('Risk Analytics')).toBeTruthy();
    expect(screen.getByText(/Research only — not advice/)).toBeTruthy();
  });

  it('hides the recent group when there is no history', () => {
    render(<QuantEmptyState onPick={vi.fn()} recent={[]} />);
    expect(screen.queryByRole('group', { name: 'Recent tickers' })).toBeNull();
  });
});
