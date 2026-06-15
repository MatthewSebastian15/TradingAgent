import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import ResultTabs from './ResultTabs';

describe('ResultTabs', () => {
  afterEach(() => cleanup());

  it('uses shadcn tabs to change active tab', () => {
    const onTabChange = vi.fn();
    render(<ResultTabs activeTab="analisis" onTabChange={onTabChange} />);

    fireEvent.click(screen.getByRole('tab', { name: /chart & price/i }));

    expect(onTabChange).toHaveBeenCalledWith('chart_price');
  });

  it('respects disabled tabs', () => {
    const onTabChange = vi.fn();
    render(<ResultTabs activeTab="analisis" onTabChange={onTabChange} disabledTabs={['news']} />);

    expect(screen.getByRole('tab', { name: /news/i })).toBeDisabled();
  });
});
