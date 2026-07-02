import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import TickerNewsQualityBadge from './TickerNewsQualityBadge';

describe('TickerNewsQualityBadge', () => {
  afterEach(() => cleanup());

  it('renders the provider with an upper-cased, de-underscored status', () => {
    render(<TickerNewsQualityBadge provider="finnhub" status="missing_api_key" />);

    expect(screen.getByText('finnhub: MISSING API KEY')).toBeTruthy();
  });

  it('falls back to UNKNOWN without a status', () => {
    render(<TickerNewsQualityBadge provider="rss" />);

    expect(screen.getByText('rss: UNKNOWN')).toBeTruthy();
  });

  it('maps status to a tone class', () => {
    render(<TickerNewsQualityBadge provider="a" status="success" />);
    render(<TickerNewsQualityBadge provider="b" status="disabled" />);
    render(<TickerNewsQualityBadge provider="c" status="error" />);

    expect(screen.getByText('a: SUCCESS').className).toContain('text-emerald-300');
    expect(screen.getByText('b: DISABLED').className).toContain('text-amber-300');
    expect(screen.getByText('c: ERROR').className).toContain('text-red-300');
  });
});
