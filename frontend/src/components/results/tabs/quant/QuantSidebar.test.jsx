import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QuantSidebar } from './QuantSidebar';

describe('QuantSidebar', () => {
  afterEach(() => cleanup());

  it('groups sections and marks the active one', () => {
    const onSelectSection = vi.fn();
    render(
      <QuantSidebar
        collapsed={false}
        onToggle={vi.fn()}
        activeSection="risk"
        onSelectSection={onSelectSection}
      >
        <div>slot</div>
      </QuantSidebar>
    );
    const nav = screen.getByRole('navigation', { name: 'Quant sections' });
    for (const group of [
      'Summary',
      'Risk Analytics',
      'Forecast',
      'Strategy',
      'Portfolio',
      'Pricing',
    ]) {
      expect(within(nav).getByText(group)).toBeTruthy();
    }
    expect(within(nav).getByRole('button', { name: 'Risk' }).getAttribute('aria-current')).toBe(
      'page'
    );
    expect(
      within(nav).getByRole('button', { name: 'Options' }).getAttribute('aria-current')
    ).toBeNull();
    fireEvent.click(within(nav).getByRole('button', { name: 'Valuation' }));
    expect(onSelectSection).toHaveBeenCalledWith('valuation');
    expect(screen.getByText('slot')).toBeTruthy();
  });

  it('collapses to an icon rail that still navigates', () => {
    const onSelectSection = vi.fn();
    const onToggle = vi.fn();
    render(
      <QuantSidebar
        collapsed
        onToggle={onToggle}
        activeSection="overview"
        onSelectSection={onSelectSection}
      >
        <div>slot</div>
      </QuantSidebar>
    );
    expect(screen.queryByText('slot')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sizing' }));
    expect(onSelectSection).toHaveBeenCalledWith('sizing');
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }));
    expect(onToggle).toHaveBeenCalled();
  });
});
