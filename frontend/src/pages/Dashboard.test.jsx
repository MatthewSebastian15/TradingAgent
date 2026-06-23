import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Dashboard from './Dashboard';
import { useGeneralNews } from '../hooks/useGeneralNews';

vi.mock('../components/Navbar', () => ({
  default: () => <nav>Navbar</nav>,
}));

vi.mock('../hooks/useGeneralNews', () => ({
  useGeneralNews: vi.fn(),
}));

describe('Dashboard', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the News summary and a chat bar that links to the chatbot', () => {
    useGeneralNews.mockReturnValue({
      data: {
        articles: [
          {
            id: 'home-news',
            title: 'Dashboard market headline',
            description: 'Dashboard market description.',
            source: 'Bloomberg',
            category: 'markets',
            published_at: '2026-06-19T11:48:00Z',
          },
        ],
      },
      error: null,
      status: 'success',
    });

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    );

    expect(useGeneralNews).toHaveBeenCalledWith({ category: 'all', windowDays: 14, limit: 100 });
    expect(screen.getByText('Dashboard market headline')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'News' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });
});
