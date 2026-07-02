import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Research from './Research';

vi.mock('../components/research/ResearchCommandBar', () => {
  function ResearchCommandBarStub({ onSubmit }) {
    return (
      <button type="button" onClick={() => onSubmit({ symbol: 'AAPL' })}>
        submit-ticker
      </button>
    );
  }
  ResearchCommandBarStub.propTypes = { onSubmit: PropTypes.func };
  return { default: ResearchCommandBarStub };
});
vi.mock('../components/research/ResearchSidebar', () => ({
  default: function ResearchSidebarStub() {
    return <div data-testid="research-sidebar" />;
  },
}));
vi.mock('../hooks/useStockOverview', () => ({
  useStockOverview: vi.fn((ticker) =>
    ticker
      ? {
          loading: false,
          error: null,
          data: {
            name: 'Apple Inc.',
            sector: 'Technology',
            price: 210.5,
            prev_close: 200,
            market_cap: 3.2e12,
            recommendation: 'BUY',
          },
        }
      : { loading: false, error: null, data: null }
  ),
}));
vi.mock('../utils/recentTickers', () => ({
  saveRecentTicker: vi.fn(),
}));
vi.mock('../utils/api', () => ({
  buildApiUrl: (path) => `/api${path}`,
  buildAuthHeaders: async () => ({}),
}));

describe('Research page', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the empty prompt before a ticker is chosen', () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    expect(screen.getByText('Enter a ticker to load stock overview')).toBeTruthy();
    expect(screen.getByTestId('research-sidebar')).toBeTruthy();
  });

  it('loads the overview cards after a ticker is submitted', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({ points: [] }) });
    render(<Research />);

    fireEvent.click(screen.getByText('submit-ticker'));

    expect(await screen.findByText('Apple Inc.')).toBeTruthy();
    expect(screen.getByText('Technology')).toBeTruthy();
    expect(screen.getByText('3.20T')).toBeTruthy();
    // Change vs prev close: +10.50 (+5.25%).
    expect(screen.getByText(/\+10\.50 \(\+5\.25%\)/)).toBeTruthy();
    for (const title of ['PRICE CHART', 'TRADING DATA', 'VALUATION MULTIPLES', 'RISK ASSESSMENT']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    expect(await screen.findByText('NO CHART DATA')).toBeTruthy();
  });
});
