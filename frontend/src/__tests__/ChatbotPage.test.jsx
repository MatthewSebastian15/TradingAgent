import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, it, expect, vi } from 'vitest';

beforeAll(() => {
  // jsdom does not implement scrollIntoView; ChatWindow calls it on mount.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

vi.mock('../hooks/useRagChat', () => ({
  useRagChat: () => ({
    messages: [],
    isLoading: false,
    error: null,
    conversations: [],
    activeId: null,
    sendMessage: vi.fn(),
    stop: vi.fn(),
    clearMessages: vi.fn(),
    newChat: vi.fn(),
    selectChat: vi.fn(),
    deleteChat: vi.fn(),
  }),
}));

vi.mock('../services/watchlistStorage', () => ({
  readWatchlistState: () => ({ groups: [] }),
}));

describe('ChatbotPage', () => {
  it('renders page title', async () => {
    const { ChatbotPage } = await import('../pages/ChatbotPage.jsx');
    render(
      <MemoryRouter>
        <ChatbotPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Chatbot' })).toBeInTheDocument();
  });
});
