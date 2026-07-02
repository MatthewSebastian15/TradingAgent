import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketOverviewPicker from './MarketOverviewPicker';
import { validateMarketSymbol } from '../../api/market';

vi.mock('../../api/market', () => ({
  validateMarketSymbol: vi.fn(async () => ({ valid: true })),
}));

function renderPicker(props = {}) {
  const onAddSymbol = vi.fn(() => ({ ok: true }));
  const onClose = vi.fn();
  render(
    <MarketOverviewPicker
      activeCategory="EQUITIES"
      existingSymbols={['^GSPC']}
      onAddSymbol={onAddSymbol}
      onClose={onClose}
      {...props}
    />
  );
  return { onAddSymbol, onClose };
}

describe('MarketOverviewPicker', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('lists presets for the active category and filters by search', () => {
    renderPicker();

    expect(screen.getByText('Add Market')).toBeTruthy();
    expect(screen.getByText('NASDAQ')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('SEARCH PRESET'), {
      target: { value: 'nikkei' },
    });
    expect(screen.getByText('NIKKEI 225')).toBeTruthy();
    expect(screen.queryByText('NASDAQ')).toBeNull();
  });

  it('validates and adds a preset symbol, then closes', async () => {
    const { onAddSymbol, onClose } = renderPicker();

    fireEvent.click(screen.getByText('NASDAQ'));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(validateMarketSymbol).toHaveBeenCalledWith('^IXIC');
    expect(onAddSymbol).toHaveBeenCalledWith('^IXIC');
  });

  it('rejects a duplicate symbol without hitting the validator', async () => {
    renderPicker();

    fireEvent.change(screen.getByPlaceholderText('CUSTOM SYMBOL'), {
      target: { value: '^gspc' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD' }));

    expect(await screen.findByText('Symbol already active.')).toBeTruthy();
    expect(validateMarketSymbol).not.toHaveBeenCalled();
  });

  it('surfaces the validator rejection reason', async () => {
    validateMarketSymbol.mockResolvedValueOnce({ valid: false, reason: 'No yfinance data found' });
    const { onClose } = renderPicker();

    fireEvent.change(screen.getByPlaceholderText('CUSTOM SYMBOL'), {
      target: { value: 'XXXX' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'ADD' }));

    expect(await screen.findByText('No yfinance data found')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});
