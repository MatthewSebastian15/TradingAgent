import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TickerSearchBar from './TickerSearchBar';

function renderSearch(props = {}) {
  const defaults = {
    value: '',
    onSelect: vi.fn(),
    onClear: vi.fn(),
    searchTickers: vi.fn(() => Promise.resolve({ results: [] })),
  };
  return render(<TickerSearchBar {...defaults} {...props} />);
}

describe('TickerSearchBar', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ popular: [], meta: { source: 'local_universe' } }),
        })
      )
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('opens dropdown on focus with recent or popular items', async () => {
    renderSearch();

    fireEvent.focus(screen.getByPlaceholderText(/search ticker symbol/i));

    expect(await screen.findByRole('option', { name: /AAPL/i })).toBeInTheDocument();
  });

  it('shows instant local result after typing one character', () => {
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
      target: { value: 'B' },
    });

    expect(screen.getByRole('option', { name: /BBCA\.JK/i })).toBeInTheDocument();
  });

  it('uses Symbol | Name | Exchange · Type | Market layout without price column', () => {
    renderSearch();

    fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
      target: { value: 'AAPL' },
    });

    expect(screen.getByText('NASDAQ · EQUITY')).toBeInTheDocument();
    expect(screen.getByText('US')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d{2}/)).not.toBeInTheDocument();
  });

  it('calls onSelect with normalized selected ticker', () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });

    fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
      target: { value: 'aapl' },
    });
    fireEvent.mouseDown(screen.getByRole('option', { name: /AAPL/i }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'AAPL' }));
  });

  it('supports keyboard navigation', () => {
    const onSelect = vi.fn();
    renderSearch({ onSelect });
    const input = screen.getByPlaceholderText(/search ticker symbol/i);

    fireEvent.change(input, { target: { value: 'BB' } });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelect).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    renderSearch();
    const input = screen.getByPlaceholderText(/search ticker symbol/i);

    fireEvent.change(input, { target: { value: 'BB' } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('closes on outside click', async () => {
    renderSearch();
    const input = screen.getByPlaceholderText(/search ticker symbol/i);

    fireEvent.change(input, { target: { value: 'BB' } });
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
  });

  it('runs remote search after debounce', async () => {
    vi.useFakeTimers();
    const searchTickers = vi.fn(() => Promise.resolve({ results: [{ symbol: 'REMOTE' }] }));
    renderSearch({ searchTickers });

    fireEvent.change(screen.getByPlaceholderText(/search ticker symbol/i), {
      target: { value: 'AA' },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
    });

    expect(searchTickers).toHaveBeenCalled();
  });
});
