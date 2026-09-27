import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { HeadlineStrip } from './HeadlineStrip';

const props = {
  issues: [
    {
      code: 'extreme_move',
      count: 1,
      dates: ['2026-01-05'],
      message: '1 daily move(s) beyond ±40% (possible unadjusted split).',
    },
  ],
  vol: 25,
  shp: 1.2,
  dd: -18,
  var95: -2.1,
  regime: { label: 'Stressed', tone: 'bad' },
  regimeDays: 6,
  hurstVal: 0.52,
  hurstSignificant: false,
};

describe('HeadlineStrip', () => {
  afterEach(() => cleanup());

  it('shows the key metrics, the only regime reading and data warnings', () => {
    render(<HeadlineStrip {...props} />);
    expect(screen.getByText('Vol Regime')).toBeTruthy();
    expect(screen.getByText('Stressed · 6d')).toBeTruthy();
    expect(screen.getByText(/possible unadjusted split/)).toBeTruthy();
    expect(screen.queryByText('Benchmark')).toBeNull();
  });
});
