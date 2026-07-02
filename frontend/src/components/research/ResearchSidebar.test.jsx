import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResearchSidebar from './ResearchSidebar';
import { readRecentTickers } from '../../utils/recentTickers';

vi.mock('../../hooks/useWatchlistStore', () => ({
  useWatchlistStore: vi.fn(() => ({
    activeGroup: { items: [{ symbol: 'BBCA.JK', exchange: 'JKT' }] },
  })),
}));
vi.mock('../../utils/recentTickers', () => ({
  readRecentTickers: vi.fn(() => [{ symbol: 'AAPL', exchange: 'NMS' }, { symbol: 'NVDA' }]),
}));

function renderSidebar(props = {}) {
  const onToggle = vi.fn();
  const onSelect = vi.fn();
  render(
    <ResearchSidebar activeTicker="AAPL" onToggle={onToggle} onSelect={onSelect} {...props} />
  );
  return { onToggle, onSelect };
}

describe('ResearchSidebar', () => {
  afterEach(() => cleanup());

  it('renders only an expand button when collapsed', () => {
    const { onToggle } = renderSidebar({ collapsed: true });

    fireEvent.click(screen.getByLabelText('Expand sidebar'));
    expect(onToggle).toHaveBeenCalled();
    expect(screen.queryByText('RECENT')).toBeNull();
  });

  it('lists recent tickers with the active one highlighted', () => {
    const { onSelect } = renderSidebar();

    expect(screen.getByText('AAPL-NMS').className).toContain('border-l-bloomberg-orange');
    fireEvent.click(screen.getByText('NVDA'));
    expect(onSelect).toHaveBeenCalledWith({ symbol: 'NVDA' });
  });

  it('switches to the watchlist tab', () => {
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'WATCHLIST' }));

    expect(screen.getByText('BBCA.JK-JKT')).toBeTruthy();
    expect(screen.queryByText('AAPL-NMS')).toBeNull();
  });

  it('shows the empty message when a tab has no tickers', () => {
    readRecentTickers.mockReturnValueOnce([]);
    renderSidebar();

    expect(screen.getByText('NO TICKERS')).toBeTruthy();
  });
});
