import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { OptionsSection } from './OptionsSection';

describe('OptionsSection', () => {
  afterEach(() => cleanup());

  it.each([
    ['IDR', 9125.4, '9125'],
    ['JPY', 2841.6, '2842'],
    ['USD', 182.456, '182.46'],
  ])('defaults the strike to the spot in %s decimals', (ccy, spot, expected) => {
    render(<OptionsSection spot={spot} defaultVol={25} defaultRate={0.04} ccy={ccy} />);
    expect(screen.getByLabelText(/^Strike/).value).toBe(expected);
  });
});
