import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import MetricBox from './MetricBox';

describe('MetricBox', () => {
  afterEach(() => cleanup());

  it('renders nothing without a value or quality payload', () => {
    const { container } = render(<MetricBox label="ENTRY" value={null} />);

    expect(container.firstChild).toBeNull();
  });

  it('keeps the slot with N/A when preserveSlot is set', () => {
    render(<MetricBox label="ENTRY" value="" preserveSlot />);

    expect(screen.getByText('ENTRY')).toBeTruthy();
    expect(screen.getByText('N/A')).toBeTruthy();
  });

  it('renders label, value, subValue, and tooltip with a tone class', () => {
    render(
      <MetricBox
        label="STOP LOSS"
        value="$120.00"
        subValue="method: atr"
        tooltip="hover text"
        tone="red"
        dataTestId="metric"
      />
    );

    const box = screen.getByTestId('metric');
    expect(box.getAttribute('title')).toBe('hover text');
    expect(box.className).toContain('border-bloomberg-red');
    expect(screen.getByText('STOP LOSS')).toBeTruthy();
    expect(screen.getByText('$120.00').className).toContain('text-bloomberg-red');
    expect(screen.getByText('method: atr')).toBeTruthy();
  });

  it('falls back to the quality status label and reason when the value is missing', () => {
    render(
      <MetricBox
        label="VOLUME"
        value={null}
        quality={{ status: 'partial', reason: 'vendor gap' }}
      />
    );

    expect(screen.getByText('Reason: vendor gap')).toBeTruthy();
  });
});
