import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import SectionHeader from './SectionHeader';

describe('SectionHeader', () => {
  afterEach(() => cleanup());

  it('renders the label with a divider line', () => {
    const { container } = render(<SectionHeader label="ACTION PLAN" />);

    expect(screen.getByText('ACTION PLAN')).toBeTruthy();
    expect(container.querySelector('.h-px')).toBeTruthy();
  });
});
