import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Market from './Market';

vi.mock('../components/market/MarketTab', () => ({
  default: function MarketTabStub() {
    return <div data-testid="market-tab" />;
  },
}));

describe('Market page', () => {
  afterEach(() => cleanup());

  it('renders the market dashboard inside the page shell', () => {
    const { container } = render(<Market />);

    expect(screen.getByTestId('market-tab')).toBeTruthy();
    expect(container.firstChild.className).toContain('pt-[60px]');
  });
});
