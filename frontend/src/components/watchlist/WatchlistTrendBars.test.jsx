import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import WatchlistTrendBars from './WatchlistTrendBars';

describe('WatchlistTrendBars', () => {
  it('renders a maximum of 18 bars', () => {
    const values = Array.from({ length: 24 }, (_, index) => index + 1);

    const { container } = render(<WatchlistTrendBars values={values} positive />);

    expect(container.querySelectorAll('rect')).toHaveLength(18);
  });

  it('renders a muted placeholder when values are empty', () => {
    const { container } = render(<WatchlistTrendBars values={[]} />);

    expect(screen.getByLabelText('No trend data')).toBeTruthy();
    expect(container.querySelector('line')).toBeTruthy();
  });

  it('uses positive state when data is up', () => {
    const { container } = render(<WatchlistTrendBars values={[1, 2, 3]} positive />);

    expect(container.querySelector('rect')?.getAttribute('class')).toContain(
      'fill-bloomberg-green'
    );
  });

  it('uses negative state when data is down', () => {
    const { container } = render(<WatchlistTrendBars values={[3, 2, 1]} positive={false} />);

    expect(container.querySelector('rect')?.getAttribute('class')).toContain('fill-bloomberg-red');
  });
});
