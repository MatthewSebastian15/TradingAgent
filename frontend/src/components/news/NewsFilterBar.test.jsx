import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/news/categoryPrefetch', () => ({
  prefetchCategory: vi.fn(),
}));

import { prefetchCategory } from '@/lib/news/categoryPrefetch';

import NewsFilterBar from './NewsFilterBar';

describe('NewsFilterBar', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders category buttons and changes category', async () => {
    const onChange = vi.fn();
    render(<NewsFilterBar selectedCategory="all" onChange={onChange} />);

    ['ALL', 'MARKETS', 'WORLD', 'MACRO', 'FOREX', 'CRYPTO'].forEach((label) => {
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

  it('calls prefetchCategory with the category key on mouse enter', async () => {
    render(<NewsFilterBar selectedCategory="all" onChange={vi.fn()} />);

    await userEvent.hover(screen.getByRole('button', { name: 'MARKETS' }));

    expect(prefetchCategory).toHaveBeenCalledWith('markets');
  });

  it('active markets tab has green inline color style', () => {
    render(<NewsFilterBar selectedCategory="markets" onChange={vi.fn()} />);

    const btn = screen.getByRole('button', { name: 'MARKETS' });
    expect(btn.style.color).toBe('rgb(34, 197, 94)');
  });

  it('active crypto tab has cyan inline color style', () => {
    render(<NewsFilterBar selectedCategory="crypto" onChange={vi.fn()} />);

    const btn = screen.getByRole('button', { name: 'CRYPTO' });
    expect(btn.style.color).toBe('rgb(6, 182, 212)');
  });
});
