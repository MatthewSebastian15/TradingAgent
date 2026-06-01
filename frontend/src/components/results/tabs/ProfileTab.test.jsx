import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import ProfileTab from './ProfileTab';

function profile(website) {
  return {
    available: true,
    name: 'Example Corporation',
    website,
  };
}

describe('ProfileTab', () => {
  afterEach(() => cleanup());

  it('renders an HTTP website as an external link', () => {
    const { container } = render(<ProfileTab profile={profile('https://example.com/about')} />);

    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://example.com/about');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>'])(
    'renders an unsafe website as text without a link',
    (website) => {
      const { container } = render(<ProfileTab profile={profile(website)} />);

      expect(screen.getByText(website)).toBeTruthy();
      expect(container.querySelector('a')).toBeNull();
    }
  );
});
