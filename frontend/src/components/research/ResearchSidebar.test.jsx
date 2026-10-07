import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResearchSidebar from './ResearchSidebar';
import { useWatchlistStore } from '../../hooks/useWatchlistStore';
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
    <MemoryRouter>
      <ResearchSidebar activeTicker="AAPL" onToggle={onToggle} onSelect={onSelect} {...props} />
    </MemoryRouter>
  );
  return { onToggle, onSelect };
}

describe('ResearchSidebar', () => {
  const originalRecent = readRecentTickers.getMockImplementation();
  const originalWatchlist = useWatchlistStore.getMockImplementation();
  afterEach(() => {
    cleanup();
    readRecentTickers.mockImplementation(originalRecent);
    useWatchlistStore.mockImplementation(originalWatchlist);
  });

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

  it('shows tab-specific empty copy', () => {
    readRecentTickers.mockReturnValue([]);
    useWatchlistStore.mockReturnValue({ activeGroup: { items: [] } });
    renderSidebar();

    expect(screen.getByText('No recent tickers yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'WATCHLIST' }));
    expect(screen.getByText('Watchlist is empty')).toBeTruthy();
  });

  it('links the empty watchlist state to the Watchlist page', () => {
    useWatchlistStore.mockReturnValue({ activeGroup: { items: [] } });
    renderSidebar();

    fireEvent.click(screen.getByRole('button', { name: 'WATCHLIST' }));
    expect(screen.getByRole('link', { name: /watchlist/i }).getAttribute('href')).toBe(
      '/watchlist'
    );
  });
});
