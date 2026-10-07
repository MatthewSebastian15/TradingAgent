import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResearchActions from './ResearchActions';

function setup(props = {}) {
  const handlers = {
    onAddToWatchlist: vi.fn(),
    onRunAnalysis: vi.fn(),
    onToggleCompare: vi.fn(),
  };
  render(<ResearchActions inWatchlist={false} comparing={false} {...handlers} {...props} />);
  return handlers;
}

describe('ResearchActions', () => {
  afterEach(cleanup);

  it('wires the three actions to their handlers', () => {
    const handlers = setup();

    fireEvent.click(screen.getByRole('button', { name: '+ WATCHLIST' }));
    fireEvent.click(screen.getByRole('button', { name: 'RUN FULL ANALYSIS' }));
    fireEvent.click(screen.getByRole('button', { name: '+ COMPARE' }));

    expect(handlers.onAddToWatchlist).toHaveBeenCalledTimes(1);
    expect(handlers.onRunAnalysis).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleCompare).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled confirmation when the ticker is already in the watchlist', () => {
    setup({ inWatchlist: true });

    const button = screen.getByRole('button', { name: /IN WATCHLIST/ });
    expect(button.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '+ WATCHLIST' })).toBeNull();
  });

  it('turns the compare button into a close control while comparing', () => {
    setup({ comparing: true });

    expect(screen.getByRole('button', { name: /CLOSE COMPARE/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '+ COMPARE' })).toBeNull();
  });
});
