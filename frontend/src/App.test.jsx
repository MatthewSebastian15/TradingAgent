import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import App from './App';

describe('App', () => {
  it('renders the dashboard route', async () => {
    window.history.pushState({}, '', '/');

    render(<App />);

    expect(await screen.findByRole('button', { name: /dashboard/i })).toBeTruthy();
  });
});
