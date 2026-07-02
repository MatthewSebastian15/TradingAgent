import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import MiniSparkline from './MiniSparkline';

describe('MiniSparkline', () => {
  afterEach(() => cleanup());

  it('draws a polyline from the values with a direction color', () => {
    render(<MiniSparkline values={[1, 2, 3]} positive />);

    const svg = screen.getByRole('img', { name: 'sparkline' });
    expect(svg.className.baseVal).toContain('text-bloomberg-green');
    const points = svg.querySelector('polyline').getAttribute('points');
    expect(points.split(' ')).toHaveLength(3);
    expect(points).toContain('0.0,32.0');
    expect(points).toContain('120.0,0.0');
  });

  it('uses red for negative and muted for unknown direction', () => {
    render(<MiniSparkline values={[3, 1]} positive={false} />);
    render(<MiniSparkline values={[]} />);

    const svgs = screen.getAllByRole('img', { name: 'sparkline' });
    expect(svgs[0].className.baseVal).toContain('text-bloomberg-red');
    expect(svgs[1].className.baseVal).toContain('text-bloomberg-muted');
    // Empty values fall back to a flat two-point line instead of crashing.
    expect(svgs[1].querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(2);
  });
});
