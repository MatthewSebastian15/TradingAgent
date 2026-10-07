import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ModeToggle, ProOnly, QuantModeProvider } from './mode';
import { useQuantMode } from './modeContext';

function Probe() {
  const { mode } = useQuantMode();
  return <span data-testid="mode">{mode}</span>;
}

function Harness() {
  const [mode, setMode] = useState('pro');
  return (
    <QuantModeProvider mode={mode} onModeChange={setMode}>
      <ModeToggle />
      <Probe />
      <ProOnly fallback={<span>basic view</span>}>
        <span>pro table</span>
      </ProOnly>
    </QuantModeProvider>
  );
}

describe('quant mode', () => {
  afterEach(() => cleanup());

  it('defaults to pro without a provider', () => {
    render(
      <>
        <Probe />
        <ProOnly>
          <span>pro table</span>
        </ProOnly>
      </>
    );
    expect(screen.getByTestId('mode').textContent).toBe('pro');
    expect(screen.getByText('pro table')).toBeTruthy();
  });

  it('switches between Basic and Pro', () => {
    render(<Harness />);
    expect(screen.getByRole('group', { name: 'Detail level' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Basic' }));
    expect(screen.getByTestId('mode').textContent).toBe('basic');
    expect(screen.queryByText('pro table')).toBeNull();
    expect(screen.getByText('basic view')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Basic' }).getAttribute('aria-pressed')).toBe('true');
  });
});
