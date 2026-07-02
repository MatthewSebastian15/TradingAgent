import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import DataQualityBadge from './DataQualityBadge';

describe('DataQualityBadge', () => {
  afterEach(() => cleanup());

  it('renders nothing without a quality payload', () => {
    const { container } = render(<DataQualityBadge quality={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('renders label, freshness, reason, and warnings', () => {
    render(
      <DataQualityBadge
        label="News quality"
        quality={{
          status: 'partial',
          reason: 'vendor timeout',
          warnings: ['stale data'],
          freshness_status: { status: 'stale' },
        }}
      />
    );

    expect(screen.getByText('News quality')).toBeTruthy();
    expect(screen.getByText('Freshness: stale')).toBeTruthy();
    // Appears in both the inner status badge and the badge's own reason row.
    expect(screen.getAllByText('Reason: vendor timeout').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/stale data/).length).toBeGreaterThan(0);
  });

  it('uses the default label and omits optional rows', () => {
    render(<DataQualityBadge quality={{ status: 'ok' }} />);

    expect(screen.getByText('Data quality')).toBeTruthy();
    expect(screen.queryByText(/^Freshness:/)).toBeNull();
    expect(screen.queryByText(/^Reason:/)).toBeNull();
  });
});
