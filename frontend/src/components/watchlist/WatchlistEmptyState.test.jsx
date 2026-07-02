import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WatchlistEmptyState from './WatchlistEmptyState';

describe('WatchlistEmptyState', () => {
  afterEach(() => cleanup());

  it('renders the empty copy and fires the create action', () => {
    const onCreateGroup = vi.fn();
    render(<WatchlistEmptyState onCreateGroup={onCreateGroup} />);

    expect(screen.getByText('No watchlist group yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'CREATE GROUP' }));
    expect(onCreateGroup).toHaveBeenCalled();
  });
});
