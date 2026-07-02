import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import MiniTrendLine from './MiniTrendLine';

describe('MiniTrendLine', () => {
  afterEach(() => cleanup());

  it('draws the trend with green for positive', () => {
    render(<MiniTrendLine values={[1, 2, 4]} positive />);

    const svg = screen.getByRole('img', { name: 'trend line' });
    expect(svg.className.baseVal).toContain('text-bloomberg-green');
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3);
  });

  it('uses red for negative and a flat placeholder for short input', () => {
    render(<MiniTrendLine values={[7]} positive={false} />);

    const svg = screen.getByRole('img', { name: 'trend line' });
    expect(svg.className.baseVal).toContain('text-bloomberg-red');
    // <2 finite values → flat 5-point placeholder line.
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(5);
  });
});
