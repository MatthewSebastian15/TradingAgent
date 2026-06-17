import '@testing-library/jest-dom/vitest';

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import NewsFilterBar from './NewsFilterBar';

describe('NewsFilterBar', () => {
  afterEach(() => cleanup());

  it('renders category buttons and changes category', async () => {
    const onChange = vi.fn();
    render(<NewsFilterBar selectedCategory="all" onChange={onChange} />);

    expect(screen.getByRole('button', { name: 'ALL' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CRYPTO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'MACRO' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'INDONESIA' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'CRYPTO' }));

    expect(onChange).toHaveBeenCalledWith('crypto');
  });

  it('renders refresh action inside the filter toolbar', async () => {
    const onChange = vi.fn();
    const onRefresh = vi.fn();
    render(
      <NewsFilterBar selectedCategory="all" onChange={onChange} onRefresh={onRefresh} />
    );

    await userEvent.click(screen.getByRole('button', { name: 'REFRESH' }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
