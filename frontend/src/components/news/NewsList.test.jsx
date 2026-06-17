import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import NewsList from './NewsList';

describe('NewsList', () => {
  afterEach(() => {
    cleanup();
  });

  it('groups every story by category', () => {
    render(
      <NewsList
        articles={[
          {
            id: '1',
            title: 'Stocks gain after earnings',
            source: 'CNBC',
            category: 'market',
            published_at: '2026-06-15T00:00:00Z',
          },
          {
            id: '2',
            title: 'Bitcoin rises after ETF flows',
            source: 'CoinDesk',
            category: 'crypto',
            published_at: '2026-06-15T00:00:00Z',
          },
          {
            id: '3',
            title: 'Unknown category story',
            source: 'Example',
            category: 'bad-category',
            published_at: '2026-06-15T00:00:00Z',
          },
        ]}
      />
    );

    const groups = screen.getAllByRole('region');
    expect(groups).toHaveLength(3);
    expect(within(groups[0]).getAllByText('MARKET').length).toBeGreaterThan(0);
    expect(within(groups[0]).getAllByText('Stocks gain after earnings').length).toBeGreaterThan(0);
    expect(within(groups[1]).getAllByText('CRYPTO').length).toBeGreaterThan(0);
    expect(within(groups[1]).getAllByText('Bitcoin rises after ETF flows').length).toBeGreaterThan(
      0
    );
    expect(within(groups[2]).getAllByText('UNKNOWN').length).toBeGreaterThan(0);
    expect(within(groups[2]).getAllByText('Unknown category story').length).toBeGreaterThan(0);
  });
});
