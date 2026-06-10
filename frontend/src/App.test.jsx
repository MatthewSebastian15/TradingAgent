import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  });

  it('does not register mock routes when mock mode is disabled', async () => {
    await renderApp('/analysis.test', false);

    expect(await screen.findByText('PAGE NOT FOUND')).toBeTruthy();
  });

  it('registers mock routes when mock mode is enabled', async () => {
    await renderApp('/analysis.test', true);

    fireEvent.click(await screen.findByTitle('Configuration'));
    expect(await screen.findByRole('button', { name: /execute analysis/i })).toBeTruthy();
  });
});
