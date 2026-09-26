import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { InfoTip } from './InfoTip';

const TEXT = 'Excess return per unit of risk.';

describe('InfoTip', () => {
  beforeAll(() => {
    // Radix Popper measures its content; jsdom has no ResizeObserver.
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
  afterEach(() => cleanup());

  it('is closed until the button is clicked, then closes on Escape', () => {
    render(<InfoTip label="Sharpe">{TEXT}</InfoTip>);
    expect(screen.queryAllByText(TEXT)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'About Sharpe' }));
    expect(screen.getAllByText(TEXT).length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryAllByText(TEXT)).toHaveLength(0);
  });

  it('opens on keyboard focus', () => {
    render(<InfoTip label="Sharpe">{TEXT}</InfoTip>);
    fireEvent.focus(screen.getByRole('button', { name: 'About Sharpe' }));
    expect(screen.getAllByText(TEXT).length).toBeGreaterThan(0);
  });
});
