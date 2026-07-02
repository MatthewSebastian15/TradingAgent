import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import ConfidenceBreakdown from './ConfidenceBreakdown';

describe('ConfidenceBreakdown', () => {
  afterEach(() => cleanup());

  it('renders nothing without scores', () => {
    expect(render(<ConfidenceBreakdown breakdown={null} />).container.firstChild).toBeNull();
    expect(
      render(<ConfidenceBreakdown breakdown={{ price_momentum: 'bad' }} />).container.firstChild
    ).toBeNull();
  });

  it('expands to show normalized rows and the overall score', () => {
    render(
      <ConfidenceBreakdown
        breakdown={{
          overall: 0.75,
          price_momentum: 0.8,
          news_sentiment: 42,
          risk_level_score: null,
        }}
      />
    );

    expect(screen.queryByText('Price Momentum')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Confidence Score Breakdown/ }));

    // Fractions normalize to 0-100; whole numbers pass through.
    expect(screen.getByText('Price Momentum')).toBeTruthy();
    expect(screen.getByText('80 / 100')).toBeTruthy();
    expect(screen.getByText('News Sentiment')).toBeTruthy();
    expect(screen.getByText('42 / 100')).toBeTruthy();
    expect(screen.queryByText('Risk Level')).toBeNull();
    expect(screen.getByText('75 / 100 · weighted average')).toBeTruthy();
  });

  it('collapses back on a second click', () => {
    render(<ConfidenceBreakdown breakdown={{ price_momentum: 55 }} />);
    const toggle = screen.getByRole('button', { name: /Confidence Score Breakdown/ });

    fireEvent.click(toggle);
    expect(screen.getByText('Price Momentum')).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.queryByText('Price Momentum')).toBeNull();
  });
});
