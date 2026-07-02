import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WatchlistGroupBar from './WatchlistGroupBar';

const GROUPS = [
  { id: 'g1', name: 'TECH' },
  { id: 'g2', name: 'BANKS' },
];

function renderBar(props = {}) {
  const handlers = {
    onSelectGroup: vi.fn(),
    onCreateGroup: vi.fn(),
    onRenameGroup: vi.fn(),
    onDeleteGroup: vi.fn(),
  };
  render(<WatchlistGroupBar groups={GROUPS} activeGroupId="g1" {...handlers} {...props} />);
  return handlers;
}

describe('WatchlistGroupBar', () => {
  afterEach(() => cleanup());

  it('renders group tabs and selects on click', () => {
    const { onSelectGroup } = renderBar();

    expect(screen.getByRole('button', { name: 'TECH' }).className).toContain(
      'border-bloomberg-orange'
    );
    fireEvent.click(screen.getByRole('button', { name: 'BANKS' }));
    expect(onSelectGroup).toHaveBeenCalledWith('g2');
  });

  it('fires create group', () => {
    const { onCreateGroup } = renderBar();

    fireEvent.click(screen.getByRole('button', { name: /GROUP/ }));
    expect(onCreateGroup).toHaveBeenCalled();
  });

  it('renames the active group via the menu', () => {
    const { onRenameGroup } = renderBar();

    fireEvent.click(screen.getByLabelText('Watchlist group menu'));
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }));

    expect(onRenameGroup).toHaveBeenCalledWith(GROUPS[0]);
  });

  it('deletes only after the confirm dialog', () => {
    const { onDeleteGroup } = renderBar();

    fireEvent.click(screen.getByLabelText('Watchlist group menu'));
    fireEvent.click(screen.getByRole('button', { name: /Delete$/ }));
    expect(onDeleteGroup).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'DELETE' }));
    expect(onDeleteGroup).toHaveBeenCalledWith('g1');
  });
});
