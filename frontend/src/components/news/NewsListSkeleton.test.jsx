import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import NewsListSkeleton from './NewsListSkeleton';

describe('NewsListSkeleton', () => {
  afterEach(() => cleanup());

  it('renders five skeleton rows by default with a loading status', () => {
    const { container } = render(<NewsListSkeleton />);

    expect(screen.getByRole('status', { name: 'Loading news' })).toBeTruthy();
    expect(container.querySelectorAll('article')).toHaveLength(5);
  });

  it('renders the requested number of rows', () => {
    const { container } = render(<NewsListSkeleton count={3} />);

    expect(container.querySelectorAll('article')).toHaveLength(3);
  });
});
