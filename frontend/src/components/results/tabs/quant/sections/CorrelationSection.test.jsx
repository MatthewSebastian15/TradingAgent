import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CorrelationSection } from './CorrelationSection';

const base = {
  peerInput: '',
  onPeerInputChange: vi.fn(),
  onAddPeers: vi.fn(),
  peers: [{ symbol: 'MSFT', points: [] }],
  onRemovePeer: vi.fn(),
  loading: false,
  symbols: ['AAPL', 'MSFT'],
  matrix: [
    [1, 0.4],
    [0.4, 1],
  ],
  rollPoints: [],
  rollLabel: 'AAPL vs MSFT',
  frontier: [],
  gmv: { ret: 5, vol: 20 },
  tangency: null,
  gmvWeights: [0.6, 0.4],
  tangencyWeights: null,
};

describe('CorrelationSection optimizer status', () => {
  afterEach(() => cleanup());

  it('explains a missing tangency portfolio and still shows min-variance weights', () => {
    render(<CorrelationSection {...base} optimizerStatus="no_tangency" />);
    expect(screen.getByText('No max-Sharpe portfolio')).toBeTruthy();
    expect(screen.getByText('Min-Variance')).toBeTruthy();
    expect(screen.queryByText(/Covariance is singular/)).toBeNull();
  });

  it('keeps the singular-covariance message for singular baskets', () => {
    render(<CorrelationSection {...base} gmvWeights={null} optimizerStatus="singular" />);
    expect(screen.getByText(/Covariance is singular/)).toBeTruthy();
  });
});
