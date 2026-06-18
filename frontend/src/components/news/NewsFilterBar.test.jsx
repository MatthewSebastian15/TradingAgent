import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NewsFilterBar from './NewsFilterBar';

describe('NewsFilterBar', () => {
  afterEach(() => cleanup());

  it('renders category buttons and changes category', async () => {
    const onChange = vi.fn();
    render(<NewsFilterBar selectedCategory="all" onChange={onChange} />);

    [
      'ALL',
      'MARKETS',
      'WORLD',
      'FINANCE',
      'TECH',
      'MACRO',
      'CENTRAL BANK',
      'REGULATORY',
      'FOREX',
      'CRYPTO',
    ].forEach((label) => {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: 'INDONESIA' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'MARKETS' }));

    expect(onChange).toHaveBeenCalledWith('markets');
  });

  it('renders refresh action inside the filter toolbar', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    render(<NewsFilterBar selectedCategory="all" onChange={onChange} onRefresh={onRefresh} />);

    await userEvent.click(screen.getByRole('button', { name: 'REFRESH' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not call onChange when selected category is clicked again', async () => {
    const onChange = vi.fn();
    render(<NewsFilterBar selectedCategory="markets" onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'MARKETS' }));

    expect(onChange).not.toHaveBeenCalled();
  });
});
