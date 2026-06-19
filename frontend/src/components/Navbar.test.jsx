import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Navbar from './Navbar';

vi.mock('../hooks/useTickerQuotes', () => ({
  EMPTY_CHANGE: '...',
  fallbackTickerQuotes: () => [
    { chg: '+0.06%', label: 'S&P', pos: true, price: 7560, sym: 'ES=F' },
  ],
  useTickerQuotes: () => ({
    fetchError: false,
    quotes: [{ chg: '+0.06%', label: 'S&P', pos: true, price: 7560, sym: 'ES=F' }],
  }),
}));

describe('Navbar', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ tool_cache: {} }),
        })
      )
    );
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('keeps the ticker tape fixed as part of the navbar', () => {
    render(
      <MemoryRouter initialEntries={['/home']}>
        <Navbar />
      </MemoryRouter>
    );

    const tickerTape = screen.getByLabelText('Global market ticker tape');
    const tickerContainer = tickerTape.parentElement;
    const nav = tickerTape.closest('nav');

    expect(nav).toHaveClass('fixed', 'left-0', 'right-0', 'top-0', 'z-50');
    expect(tickerContainer).toHaveClass('h-7', 'overflow-hidden', 'border-b');
    expect(tickerContainer).not.toHaveClass('fixed');
    expect(screen.getByText('S&P')).toBeInTheDocument();
  });
});
