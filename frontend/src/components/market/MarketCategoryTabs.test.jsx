import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import MarketCategoryTabs from './MarketCategoryTabs';

describe('MarketCategoryTabs', () => {
  afterEach(() => cleanup());

  it('renders one tab per market category with the active one highlighted', () => {
    render(<MarketCategoryTabs activeCategory="FX" onChangeCategory={vi.fn()} />);

    for (const label of ['EQUITIES', 'FX', 'COMMODITIES', 'FIXED INCOME', 'CRYPTO']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByRole('button', { name: 'FX' }).className).toContain('bg-bloomberg-orange');
  });

  it('fires the change callback with the clicked category key', () => {
    const onChangeCategory = vi.fn();
    render(<MarketCategoryTabs activeCategory="EQUITIES" onChangeCategory={onChangeCategory} />);

    fireEvent.click(screen.getByRole('button', { name: 'FIXED INCOME' }));

    expect(onChangeCategory).toHaveBeenCalledWith('FIXED_INCOME');
  });
});
