import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { AdvancedPanel } from './AdvancedPanel';

describe('AdvancedPanel', () => {
  afterEach(() => cleanup());

  it('is a closed disclosure by default', () => {
    const { container } = render(
      <AdvancedPanel>
        <span>seed input</span>
      </AdvancedPanel>
    );
    const details = container.querySelector('details');
    expect(details.open).toBe(false);
    expect(screen.getByText('Advanced').closest('summary')).toBeTruthy();
    expect(screen.getByText('seed input')).toBeTruthy();
  });

  it('can start open with a custom label', () => {
    const { container } = render(
      <AdvancedPanel label="Model settings" defaultOpen>
        <span>x</span>
      </AdvancedPanel>
    );
    expect(container.querySelector('details').open).toBe(true);
    expect(screen.getByText('Model settings')).toBeTruthy();
  });
});
