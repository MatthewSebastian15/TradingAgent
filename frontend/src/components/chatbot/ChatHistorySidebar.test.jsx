import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatHistorySidebar } from './ChatHistorySidebar';

const CONVERSATIONS = [
  { id: 'c1', title: 'AAPL earnings chat' },
  { id: 'c2', title: 'Watchlist review' },
];

function renderSidebar(props = {}) {
  const onNew = vi.fn();
  const onSelect = vi.fn();
  const onDelete = vi.fn();
  const { container } = render(
    <ChatHistorySidebar
      conversations={CONVERSATIONS}
      activeId="c1"
      onNew={onNew}
      onSelect={onSelect}
      onDelete={onDelete}
      {...props}
    />
  );
  return { container, onNew, onSelect, onDelete };
}

describe('ChatHistorySidebar', () => {
  afterEach(() => cleanup());

  it('starts collapsed as an icon rail and expands on hover', () => {
    const { container } = renderSidebar();
    const aside = container.querySelector('aside');

    expect(screen.queryByText('AAPL earnings chat')).toBeNull();
    fireEvent.mouseEnter(aside);
    expect(screen.getByText('New Chat')).toBeTruthy();
    expect(screen.getByText('AAPL earnings chat')).toBeTruthy();

    fireEvent.mouseLeave(aside);
    expect(screen.queryByText('AAPL earnings chat')).toBeNull();
  });

  it('fires onNew and onSelect', () => {
    const { onNew, onSelect } = renderSidebar();

    fireEvent.click(screen.getByTitle('New chat'));
    expect(onNew).toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('Watchlist review'));
    expect(onSelect).toHaveBeenCalledWith('c2');
  });

  it('deletes without also selecting the row', () => {
    const { container, onDelete, onSelect } = renderSidebar();

    fireEvent.mouseEnter(container.querySelector('aside'));
    fireEvent.click(screen.getAllByTitle('Delete chat')[0]);

    expect(onDelete).toHaveBeenCalledWith('c1');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
