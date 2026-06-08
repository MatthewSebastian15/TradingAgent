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



  it('renders shares and ownership data above the business description', () => {
    render(
      <ProfileTab
        profile={{
          available: true,
          ticker: 'BBCA.JK',
          shares_outstanding: 123275050000,
          insider_percent: 0.0503,
          institution_percent: 0.4444,
          short_ratio: 1.25,
          business_summary: 'Banking profile.',
        }}
      />
    );

    expect(screen.getByText('SHARES & OWNERSHIP')).toBeTruthy();
    expect(screen.getByText('OWNERSHIPS')).toBeTruthy();
    expect(screen.getByText('SHARES OUT')).toBeTruthy();
    expect(screen.getAllByText('123,275,050,000').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5.03%').length).toBeGreaterThan(0);
    expect(screen.getAllByText('44.44%').length).toBeGreaterThan(0);
    expect(screen.getByText('1.25')).toBeTruthy();
    expect(screen.getByText('50.53%')).toBeTruthy();
  });

  it('renders canonical fields and N/A for missing values', () => {
    render(
      <ProfileTab
        profile={{
          available: true,
          ticker: 'BBCA.JK',
          company_name: 'PT Bank Central Asia Tbk',
          exchange: 'IDX',
          currency: 'IDR',
          country: 'Indonesia',
          sector: 'Financial Services',
          industry: 'Banks',
          market_cap: 1205000000000000,
          shares_outstanding: 123275050000,
          current_price: 9800,
          fiscal_year_end: 'December',
          full_time_employees: 27000,
          website: 'https://www.bca.co.id',
          data_quality: { status: 'partial' },
        }}
      />
    );

    expect(screen.getByText('PT Bank Central Asia Tbk')).toBeTruthy();
    expect(screen.queryByText('Profile data: partial')).toBeNull();
    expect(screen.getByText('1,205,000.0 IDR Bn')).toBeTruthy();
    expect(screen.getByText('123,275,050,000')).toBeTruthy();
    expect(screen.getByText('Rp 9,800')).toBeTruthy();
    expect(screen.getByText('27,000')).toBeTruthy();
    expect(screen.getByText('Websites')).toBeTruthy();
    expect(screen.queryByText('Exchange')).toBeNull();
    expect(screen.queryByText('IDX')).toBeNull();
    expect(screen.queryByText('Fiscal Year End')).toBeNull();
    expect(screen.queryByText('December')).toBeNull();
    expect(screen.getAllByText('N/A').length).toBeGreaterThan(0);
  });
});
