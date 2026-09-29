import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NewsList from './NewsList';

describe('NewsList', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders every story mixed together from newest to oldest', () => {
    const { container } = render(
      <NewsList
        articles={[
          {
            id: '1',
            title: 'Older market story',
            source: 'CNBC',
            category: 'markets',
            published_at: '2026-06-15T00:00:00Z',
          },
          {
            id: '2',
            title: 'Newest crypto story',
            source: 'CoinDesk',
            category: 'crypto',
            published_at: '2026-06-17T00:00:00Z',
          },
          {
            id: '3',
            title: 'Middle macro story',
            source: 'BBC',
            category: 'macro',
            published_at: '2026-06-16T00:00:00Z',
          },
        ]}
      />
    );

    expect(screen.queryAllByRole('region')).toHaveLength(0);
    const text = container.textContent;
    expect(text.indexOf('Newest crypto story')).toBeLessThan(text.indexOf('Middle macro story'));
    expect(text.indexOf('Middle macro story')).toBeLessThan(text.indexOf('Older market story'));
  });

  it('calls onLoadMore when the sentinel intersects and hasMore is true', () => {
    let intersectionCallback;
    const observe = vi.fn();
    const disconnect = vi.fn();
    window.IntersectionObserver = vi.fn(function (cb) {
      intersectionCallback = cb;
      return { observe, disconnect };
    });
    const onLoadMore = vi.fn();

    render(
      <NewsList
        articles={[{ id: '1', title: 'Story', published_at: '2026-06-17T00:00:00Z' }]}
        hasMore
        onLoadMore={onLoadMore}
      />
    );

    expect(observe).toHaveBeenCalled();
    intersectionCallback([{ isIntersecting: true }]);

    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });
});
