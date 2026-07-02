import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import NoticeBox from './NoticeBox';

describe('NoticeBox', () => {
  afterEach(() => cleanup());

  it('renders title and children with the default amber tone', () => {
    const { container } = render(<NoticeBox title="HEADS UP">Something degraded.</NoticeBox>);

    expect(screen.getByText('HEADS UP')).toBeTruthy();
    expect(screen.getByText('Something degraded.')).toBeTruthy();
    expect(container.firstChild.className).toContain('border-bloomberg-amber');
  });

  it('applies the red tone and skips the body without children', () => {
    const { container } = render(<NoticeBox title="FAILED" tone="red" />);

    expect(container.firstChild.className).toContain('border-bloomberg-red');
    expect(container.querySelectorAll('div')).toHaveLength(2);
  });
});
