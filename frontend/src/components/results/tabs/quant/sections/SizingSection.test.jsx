import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SizingSection } from './SizingSection';

describe('SizingSection', () => {
  afterEach(() => cleanup());

  it('shows the capped suggestion, not raw half-Kelly', () => {
    render(
      <SizingSection
        kelly={2.4}
        volWeight={0.3}
        vol={50}
        regime={{ label: 'Normal', tone: 'neutral' }}
        hurstVal={0.5}
        ouHL={null}
      />
    );
    expect(screen.getByTestId('suggested-position').textContent).toBe('30%');
  });
});
