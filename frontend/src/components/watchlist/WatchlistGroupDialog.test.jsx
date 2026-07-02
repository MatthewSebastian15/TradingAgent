import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import WatchlistGroupDialog from './WatchlistGroupDialog';

function renderDialog(props = {}) {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  render(
    <WatchlistGroupDialog
      open
      mode="create"
      existingNames={['TECH']}
      onCancel={onCancel}
      onSubmit={onSubmit}
      {...props}
    />
  );
  return { onCancel, onSubmit };
}

describe('WatchlistGroupDialog', () => {
  afterEach(() => cleanup());

  it('renders per-mode title and submit label', () => {
    renderDialog();
    expect(screen.getByText('CREATE WATCHLIST GROUP')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'CREATE' })).toBeTruthy();
    cleanup();

    renderDialog({ mode: 'rename', initialName: 'TECH' });
    expect(screen.getByText('RENAME WATCHLIST GROUP')).toBeTruthy();
    expect(screen.getByPlaceholderText('Group name').value).toBe('TECH');
  });

  it('validates empty and duplicate names', () => {
    const { onSubmit } = renderDialog();
    const submit = screen.getByRole('button', { name: 'CREATE' });

    fireEvent.click(submit);
    expect(screen.getByText('Group name is required.')).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Group name'), {
      target: { value: ' tech ' },
    });
    fireEvent.click(submit);
    expect(screen.getByText('Group name already exists.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('allows keeping the current name in rename mode', () => {
    const { onSubmit } = renderDialog({ mode: 'rename', initialName: 'TECH' });

    fireEvent.click(screen.getByRole('button', { name: 'SAVE' }));

    expect(onSubmit).toHaveBeenCalledWith('TECH');
  });

  it('submits the trimmed name and cancels via the button', () => {
    const { onSubmit, onCancel } = renderDialog();

    fireEvent.change(screen.getByPlaceholderText('Group name'), {
      target: { value: '  BANKS  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'CREATE' }));
    expect(onSubmit).toHaveBeenCalledWith('BANKS');

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
