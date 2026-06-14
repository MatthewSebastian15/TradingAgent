import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_RESEARCH_MOCK_PATH, AI_RESEARCH_PATH } from './constants/routes';

async function renderApp(path, enableMock) {
  vi.stubEnv('VITE_ENABLE_MOCK', enableMock ? 'true' : 'false');
  vi.resetModules();
  const { default: App } = await import('./App');

  window.history.pushState({}, '', path);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe('App', () => {
  it('renders the dashboard route', async () => {
    await renderApp('/', false);

    expect(await screen.findByRole('button', { name: /home/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai research/i })).toBeTruthy();
  });

  it('registers the AI Research route', async () => {
    await renderApp(AI_RESEARCH_PATH, false);

    expect(await screen.findByTitle('Configuration')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai research/i })).toBeTruthy();
  });

  it('does not register mock routes when mock mode is disabled', async () => {
    await renderApp(AI_RESEARCH_MOCK_PATH, false);

    expect(await screen.findByText('PAGE NOT FOUND')).toBeTruthy();
  });

  it('registers mock routes when mock mode is enabled', async () => {
    await renderApp(AI_RESEARCH_MOCK_PATH, true);

    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
  });
});
