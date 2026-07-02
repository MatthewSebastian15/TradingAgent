import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatWindow } from './ChatWindow';

// jsdom does not implement scrollIntoView; ChatWindow calls it on mount.
Element.prototype.scrollIntoView = vi.fn();

function renderWindow(props = {}) {
  const onSend = vi.fn();
  const onStop = vi.fn();
  render(<ChatWindow messages={[]} isLoading={false} onSend={onSend} onStop={onStop} {...props} />);
  return { onSend, onStop };
}

describe('ChatWindow', () => {
  afterEach(() => cleanup());

  it('shows the empty prompt and a disabled send button', () => {
    renderWindow();

    expect(screen.getByText(/Ask about your news, market/)).toBeTruthy();
    expect(screen.getByRole('button').disabled).toBe(true);
  });

  it('renders the message list', () => {
    renderWindow({
      messages: [
        { id: 'm1', role: 'user', content: 'hello' },
        { id: 'm2', role: 'assistant', content: 'hi there' },
      ],
    });

    expect(screen.getByText('hello')).toBeTruthy();
    expect(screen.getByText('hi there')).toBeTruthy();
  });

  it('sends trimmed input on Enter and clears the field', () => {
    const { onSend } = renderWindow();
    const textarea = screen.getByPlaceholderText(/Ask about news/);

    fireEvent.change(textarea, { target: { value: '  what is up  ' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onSend).toHaveBeenCalledWith('what is up');
    expect(textarea.value).toBe('');
  });

  it('shows the stop button and typing dots while loading', () => {
    const { onStop, onSend } = renderWindow({ isLoading: true });

    fireEvent.click(screen.getByTitle('Stop'));
    expect(onStop).toHaveBeenCalled();

    // Input is disabled — no sends while streaming.
    const textarea = screen.getByPlaceholderText(/Ask about news/);
    expect(textarea.disabled).toBe(true);
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(onSend).not.toHaveBeenCalled();
  });

  it('renders the error bubble', () => {
    renderWindow({ error: 'RAG backend unreachable' });

    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('RAG backend unreachable')).toBeTruthy();
  });
});
