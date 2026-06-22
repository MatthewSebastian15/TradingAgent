import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WatchlistTickerInput from './WatchlistTickerInput';

function renderInput(props = {}) {
  const defaults = {
    value: '',
    selectedTicker: null,
    onChange: vi.fn(),
    onSelectTicker: vi.fn(),
    onClear: vi.fn(),
    onAdd: vi.fn(),
    addDisabled: false,
    loading: false,
  };
  return render(<WatchlistTickerInput {...defaults} {...props} />);
}

describe('WatchlistTickerInput', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.setItem(
      '_ta_owner_session_expires_at',
      String(Math.floor(Date.now() / 1000) + 3600)
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ results: [] }) }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('uses same hook result behavior', () => {
    renderInput({ value: 'BB' });
    fireEvent.focus(screen.getByPlaceholderText(/search ticker symbol/i));

    expect(screen.getByRole('option', { name: /BBCA\.JK/i })).toBeInTheDocument();
  });

  it('keeps Enter behavior for add when no active result', () => {
    const onAdd = vi.fn();
    renderInput({ value: '', onAdd });

    fireEvent.keyDown(screen.getByPlaceholderText(/search ticker symbol/i), { key: 'Enter' });

    expect(onAdd).toHaveBeenCalled();
  });

  it('selects active result on Enter', () => {
    const onSelectTicker = vi.fn();
    renderInput({ value: 'BB', onSelectTicker });
    const input = screen.getByPlaceholderText(/search ticker symbol/i);
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSelectTicker).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BBCA.JK' }));
  });

  it('does not render price column', () => {
    renderInput({ value: 'AAPL' });
    fireEvent.focus(screen.getByPlaceholderText(/search ticker symbol/i));

    expect(screen.getByText('NASDAQ · EQUITY')).toBeInTheDocument();
    expect(screen.queryByText(/\d+\.\d{2}/)).not.toBeInTheDocument();
  });

  it('calls onSelectTicker with normalized watchlist symbol', () => {
    const onSelectTicker = vi.fn();
    renderInput({ value: 'bbca.jk', onSelectTicker });
    fireEvent.focus(screen.getByPlaceholderText(/search ticker symbol/i));

    fireEvent.mouseDown(screen.getByRole('option', { name: /BBCA\.JK/i }));

    expect(onSelectTicker).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'BBCA.JK' }));
  });

  it('calls remote through backend after debounce for query length >= 2', async () => {
    vi.useFakeTimers();
    renderInput({ value: 'AA' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(150);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/market/search?'),
      expect.any(Object)
    );
  });
});
