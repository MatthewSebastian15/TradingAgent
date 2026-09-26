import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { id: false, label: 'Sample' },
  { id: true, label: 'Ledoit-Wolf' },
  { id: 'x', label: 'Disabled', disabled: true },
];

describe('SegmentedControl', () => {
  afterEach(() => cleanup());

  it('exposes a named group with pressed state and reports new ids only', () => {
    const onChange = vi.fn();
    render(
      <SegmentedControl
        ariaLabel="Covariance"
        options={OPTIONS}
        value={false}
        onChange={onChange}
      />
    );

    expect(screen.getByRole('group', { name: 'Covariance' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sample' }).getAttribute('aria-pressed')).toBe(
      'true'
    );
    expect(screen.getByRole('button', { name: 'Ledoit-Wolf' }).getAttribute('aria-pressed')).toBe(
      'false'
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sample' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Ledoit-Wolf' }));
    expect(onChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole('button', { name: 'Disabled' }).disabled).toBe(true);
  });

  it('uses the visible label as the group name', () => {
    render(
      <SegmentedControl
        label="Horizon"
        ariaLabel="VaR horizon"
        options={[{ id: 1, label: '1D' }]}
        value={1}
        onChange={() => {}}
      />
    );
    expect(screen.getByText('Horizon')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Horizon' })).toBeTruthy();
  });
});
