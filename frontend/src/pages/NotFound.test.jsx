import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NotFound from './NotFound';

const navigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
}));

describe('NotFound', () => {
  afterEach(() => {
    cleanup();
    navigate.mockClear();
  });

  it('renders the 404 copy and navigates home', () => {
    render(<NotFound />);

    expect(screen.getByText('404')).toBeTruthy();
    expect(screen.getByText('PAGE NOT FOUND')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /RETURN TO HOME/ }));
    expect(navigate).toHaveBeenCalledWith('/home');
  });
});
