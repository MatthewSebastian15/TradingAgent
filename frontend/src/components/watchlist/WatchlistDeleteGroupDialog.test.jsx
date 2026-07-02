import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WatchlistDeleteGroupDialog from './WatchlistDeleteGroupDialog';

describe('WatchlistDeleteGroupDialog', () => {
  afterEach(() => cleanup());

  it('stays closed without a group', () => {
    render(<WatchlistDeleteGroupDialog group={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    expect(screen.queryByText('Delete watchlist group')).toBeNull();
  });

  it('confirms deletion with the group id', () => {
    const onConfirm = vi.fn();
    render(
      <WatchlistDeleteGroupDialog
        group={{ id: 'g1', name: 'TECH' }}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByText('Delete watchlist group')).toBeTruthy();
    expect(screen.getByText('TECH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'DELETE' }));
    expect(onConfirm).toHaveBeenCalledWith('g1');
  });

  it('cancels without deleting', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <WatchlistDeleteGroupDialog
        group={{ id: 'g1', name: 'TECH' }}
        onCancel={onCancel}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(onCancel).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
