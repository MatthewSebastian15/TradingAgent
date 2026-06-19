import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
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

  it('renders Home News Summary before existing Home heading with the News tab data source', () => {
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

    render(<Dashboard />);

    expect(useGeneralNews).toHaveBeenCalledWith({ category: 'all', windowDays: 7, limit: 100 });
    expect(screen.getByText('Dashboard market headline')).toBeInTheDocument();

    const summaryHeading = screen.getByRole('heading', { name: 'Summary News' });
    const homeHeading = screen.getByRole('heading', { name: 'Home' });

    expect(
      summaryHeading.compareDocumentPosition(homeHeading) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
