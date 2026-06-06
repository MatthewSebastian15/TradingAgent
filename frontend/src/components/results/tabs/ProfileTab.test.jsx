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

  it('renders canonical fields and N/A for missing values', () => {
    render(
      <ProfileTab
        profile={{
          available: true,
          ticker: 'BBCA.JK',
          company_name: 'PT Bank Central Asia Tbk',
          currency: 'IDR',
          market_cap: 1205000000000000,
          shares_outstanding: 123275050000,
          current_price: 9800,
          data_quality: { status: 'partial' },
        }}
      />
    );

    expect(screen.getByText('PT Bank Central Asia Tbk')).toBeTruthy();
    expect(screen.queryByText('Profile data: partial')).toBeNull();
    expect(screen.getByText('1,205,000.0 IDR Bn')).toBeTruthy();
    expect(screen.getByText('123,275,050,000')).toBeTruthy();
    expect(screen.getByText('Rp 9,800')).toBeTruthy();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });
});
