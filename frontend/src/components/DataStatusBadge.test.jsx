import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import DataStatusBadge from './DataStatusBadge';
import MetricBox from './results/MetricBox';
import { getDataStatusLabel } from '../utils/dataStatus';

describe('DataStatusBadge', () => {
  afterEach(() => cleanup());

  it('maps standard backend statuses to readable labels', () => {
    expect(getDataStatusLabel('calculated')).toBe('Calculated');
    expect(getDataStatusLabel('source_unavailable')).toBe('Source unavailable');
    expect(getDataStatusLabel('conflict')).toBe('Conflict');
  });

  it('renders source reason and confidence metadata', () => {
    render(
      <DataStatusBadge
        status="calculated"
        source="local_calculation_from_historical_price"
        reason="SMA 200 calculated from close prices."
        confidenceScore={92}
      />
    );

    expect(screen.getByText('Calculated')).toBeInTheDocument();
    expect(screen.getByText(/Source: local calculation from historical price/i)).toBeInTheDocument();
    expect(screen.getByText(/Confidence: 92/i)).toBeInTheDocument();
    expect(screen.getByText(/Reason: SMA 200 calculated/i)).toBeInTheDocument();
  });

  it('shows reason instead of plain N/A when quality metadata exists', () => {
    render(
      <MetricBox
        label="Dividend Yield"
        value={null}
        quality={{ status: 'no_dividend_history', reason: 'No cash dividend found' }}
        preserveSlot
      />
    );

    expect(screen.getAllByText(/No dividend history/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/No cash dividend found/i)).toBeInTheDocument();
    expect(screen.queryByText(/^N\/A$/i)).not.toBeInTheDocument();
  });

});
