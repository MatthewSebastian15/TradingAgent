import { cleanup, render } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { VolatilitySection } from './VolatilitySection';

const base = { vol: 25, ewma: 22, rollingVols: [20, 22, 24], rollingPoints: [] };

describe('VolatilitySection', () => {
  afterEach(() => cleanup());

  it('shows the annualization factor in the formula text', () => {
    const { container, rerender } = render(<VolatilitySection {...base} ppy={365} />);
    expect(container.textContent).toContain('√365');
    rerender(<VolatilitySection {...base} />);
    expect(container.textContent).toContain('√252');
  });
});
