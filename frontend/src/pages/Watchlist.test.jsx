import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import Watchlist from './Watchlist';

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Watchlist page', () => {
  it('renders the watchlist module page', async () => {
    render(
      <MemoryRouter>
        <Watchlist />
      </MemoryRouter>
    );

    expect(await screen.findByRole('heading', { name: /watchlist/i })).toBeTruthy();
    // Both top navbar and left sidebar render a Watchlist button
    expect(screen.getAllByRole('button', { name: /watchlist/i }).length).toBeGreaterThan(0);
  });
});
