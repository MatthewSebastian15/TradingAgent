import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import AnalysisStatusRow from './AnalysisStatusRow';

const METRICS = [
  { label: 'ENTRY', value: '$100.00' },
  { label: 'STOP LOSS', value: '$90.00', tone: 'red' },
];

describe('AnalysisStatusRow', () => {
  afterEach(() => cleanup());

  it('renders nothing with no metrics', () => {
    const { container } = render(
      <AnalysisStatusRow label="ACTION PLAN" metrics={[]} columnsClass="grid" />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders the header and one metric box per entry', () => {
    render(<AnalysisStatusRow label="ACTION PLAN" metrics={METRICS} columnsClass="grid" />);

    expect(screen.getByText('ACTION PLAN')).toBeTruthy();
    expect(screen.getByText('ENTRY')).toBeTruthy();
    expect(screen.getByText('$100.00')).toBeTruthy();
    expect(screen.getByText('STOP LOSS')).toBeTruthy();
    expect(screen.getByText('$90.00')).toBeTruthy();
  });

  it('renders the reason through the renderer when provided', () => {
    render(
      <AnalysisStatusRow
        label="ACTION PLAN"
        metrics={METRICS}
        columnsClass="grid"
        reason="sized by volatility"
        reasonRenderer={(text) => text.toUpperCase()}
      />
    );

    expect(screen.getByText('SIZED BY VOLATILITY')).toBeTruthy();
  });
});
