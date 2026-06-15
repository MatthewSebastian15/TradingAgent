import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_AGENT_MOCK_PATH, AI_AGENT_PATH } from './constants/routes';

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
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /research/i }).getAttribute('aria-disabled')
    ).toBeNull();
  });

  it('registers the Research placeholder route', async () => {
    await renderApp('/research', false);

    expect(await screen.findByText('COMING SOON')).toBeTruthy();
    expect(screen.getByText('Research module is under development.')).toBeTruthy();
  });

  it('registers the ECON placeholder route', async () => {
    await renderApp('/econ', false);

    expect(await screen.findByText('COMING SOON')).toBeTruthy();
    expect(screen.getByText('Economic dashboard is under development.')).toBeTruthy();
  });

  it('registers the AI Agent route', async () => {
    await renderApp(AI_AGENT_PATH, false);

    expect(await screen.findByTitle('Configuration')).toBeTruthy();
    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /ai agent/i })).toBeTruthy();
  });

  it('does not register mock routes when mock mode is disabled', async () => {
    await renderApp(AI_AGENT_MOCK_PATH, false);

    expect(await screen.findByText('PAGE NOT FOUND')).toBeTruthy();
  });

  it('registers mock routes when mock mode is enabled', async () => {
    await renderApp(AI_AGENT_MOCK_PATH, true);

    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
  });
});
