import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { SECTIONS } from './config';
import { SKELETON_LAYOUTS } from './config';
import { SectionSkeleton } from './SectionSkeleton';

describe('SectionSkeleton', () => {
  afterEach(() => cleanup());

  it('has a layout for every section', () => {
    for (const s of SECTIONS) expect(SKELETON_LAYOUTS[s.id]?.length).toBeGreaterThan(0);
  });

  it('mirrors the risk layout in order and announces loading', () => {
    const { container } = render(<SectionSkeleton section="risk" />);
    expect(screen.getByRole('status', { name: 'Loading Risk' })).toBeTruthy();
    const blocks = [...container.querySelectorAll('[data-block]')].map((el) =>
      el.getAttribute('data-block')
    );
    expect(blocks).toEqual(['context', 'headline', ...SKELETON_LAYOUTS.risk]);
    expect(container.querySelectorAll('[data-block="cards5"] > div')).toHaveLength(5);
  });

  it('falls back to the overview layout for unknown ids', () => {
    render(<SectionSkeleton section="nope" />);
    expect(screen.getByRole('status', { name: 'Loading Overview' })).toBeTruthy();
  });
});
