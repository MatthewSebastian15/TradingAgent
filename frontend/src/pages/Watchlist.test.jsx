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
    expect(screen.getByRole('button', { name: /watchlist/i })).toBeTruthy();
  });
});
