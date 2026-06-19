import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WatchlistPage from './WatchlistPage';

vi.mock('../../api/market', () => ({
  getMarketQuotes: vi.fn(() =>
    Promise.resolve({
      quotes: [
        {
          sym: 'NVDA',
          chg: '+2.95%',
          pos: true,
          price: 210.69,
          volume: 246900000,
          error: false,
        },
      ],
    })
  ),
  getMarketSparklines: vi.fn(() =>
    Promise.resolve({ sparklines: { NVDA: [189.2, 191.4, 195.8, 210.69] } })
  ),
  searchMarketTickers: vi.fn(() =>
    Promise.resolve({
      results: [
        {
          symbol: 'NVDA',
          name: 'NVIDIA Corporation',
          exchange: 'NASDAQ',
          type: 'EQUITY',
          market: 'US',
          source: 'test',
          price: 210.69,
        },
      ],
    })
  ),
  validateMarketSymbol: vi.fn(() =>
    Promise.resolve({ symbol: 'NVDA', valid: true, label: 'NVIDIA Corporation', source: 'test' })
  ),
}));

async function createGroup(user, name = 'US Tech') {
  await user.click(screen.getByRole('button', { name: /create group/i }));
  await user.type(screen.getByPlaceholderText('Group name'), name);
  await user.click(screen.getByRole('button', { name: /^create$/i }));
  await screen.findByText(name);
}

async function addNvda(user) {
  const input = screen.getByPlaceholderText('Search ticker symbol');
  await user.type(input, 'NVDA');
  const option = await screen.findByRole('option', { name: /NVDA/i });
  await user.click(option);
  await user.click(screen.getByRole('button', { name: /^add$/i }));
  await screen.findByLabelText('Delete NVDA');
  await waitFor(() => expect(input).toHaveValue(''));
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('WatchlistPage', () => {
  it('renders empty state when there is no group', () => {
    render(<WatchlistPage />);

    expect(screen.getByText('No watchlist group yet')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search ticker symbol')).toBeDisabled();
  });

  it('opens create group dialog from empty state', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    await user.click(screen.getByRole('button', { name: /create group/i }));

    expect(screen.getByText('CREATE WATCHLIST GROUP')).toBeTruthy();
    expect(screen.getByPlaceholderText('Group name')).toBeTruthy();
  });

  it('adds a selected ticker to the active group', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    await createGroup(user);
    await addNvda(user);

    expect(await screen.findByLabelText('Delete NVDA')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('246.9M')).toBeTruthy());
  });

  it('shows an error for duplicate ticker in the same group', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    await createGroup(user);
    await addNvda(user);
    await user.type(screen.getByPlaceholderText('Search ticker symbol'), 'NVDA');
    await user.click(await screen.findByRole('option', { name: /NVDA/i }));

    expect(await screen.findByText('Ticker already exists in this group.')).toBeTruthy();
  });

  it('does not render the old watchlist subtitle', () => {
    render(<WatchlistPage />);

    expect(
      screen.queryByText('Grouped tickers, compact quotes, and mini trend bars.')
    ).not.toBeInTheDocument();
  });

  it('uses a custom dialog to confirm group deletion', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    await createGroup(user, 'testing');
    await user.click(screen.getByLabelText('Watchlist group menu'));

    const menu = screen.getByText('Rename').closest('div');
    await user.click(within(menu).getByRole('button', { name: /delete/i }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Delete watchlist group')).toBeTruthy();
    expect(screen.getByText(/This removes the group and all tickers inside it\./i)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: /^delete$/i }));

    expect(screen.getByText('No watchlist group yet')).toBeTruthy();
  });

  it('deletes a ticker row', async () => {
    const user = userEvent.setup();
    render(<WatchlistPage />);

    await createGroup(user);
    await addNvda(user);
    await user.click(screen.getByLabelText('Delete NVDA'));

    expect(screen.queryByLabelText('Delete NVDA')).toBeNull();
    expect(screen.getByText('No ticker in this group yet.')).toBeTruthy();
  });
});
