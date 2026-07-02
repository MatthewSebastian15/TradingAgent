import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatMessage } from './ChatMessage';

describe('ChatMessage', () => {
  afterEach(() => cleanup());

  it('renders a user message right-aligned in orange', () => {
    const { container } = render(
      <ChatMessage message={{ role: 'user', content: 'What moved AAPL today?' }} />
    );

    expect(screen.getByText('What moved AAPL today?').parentElement.className).toContain(
      'bg-bloomberg-orange'
    );
    expect(container.firstChild.className).toContain('justify-end');
  });

  it('renders an assistant message with pool badges', () => {
    render(
      <ChatMessage
        message={{
          role: 'assistant',
          content: 'AAPL rose on earnings.',
          poolUsed: ['news', 'market', 'custom_pool'],
        }}
      />
    );

    expect(screen.getByText('AAPL rose on earnings.')).toBeTruthy();
    expect(screen.getByText('News')).toBeTruthy();
    expect(screen.getByText('Market')).toBeTruthy();
    // Unknown pools fall back to the raw id.
    expect(screen.getByText('custom_pool')).toBeTruthy();
  });

  it('flags out-of-scope answers and hides badges for user messages', () => {
    render(
      <ChatMessage
        message={{ role: 'user', content: 'Weather?', outOfScope: true, poolUsed: ['news'] }}
      />
    );

    expect(screen.getByText('⚠ Out of scope')).toBeTruthy();
    expect(screen.queryByText('News')).toBeNull();
  });
});
