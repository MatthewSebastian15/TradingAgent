import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CorrelationSection } from './CorrelationSection';

vi.mock('../../../../TickerSearchBar', () => ({
  default: function TickerSearchBarStub({ onSelect, onSubmit, placeholder }) {
    return (
      <div>
        <span>{placeholder}</span>
        <button type="button" onClick={() => onSelect({ symbol: 'NVDA' })}>
          pick-nvda
        </button>
        <button type="button" onClick={() => onSubmit('amd, intc')}>
          submit-raw
        </button>
      </div>
    );
  },
}));

const portfolios = [
  { id: 'gmv', label: 'Min-variance', weights: [0.7, 0.3], ret: 8, vol: 18, sharpe: 0.3 },
  {
    id: 'lo_sharpe',
    label: 'Max-Sharpe (long-only)',
    weights: [0.4, 0.6],
    ret: 11,
    vol: 22,
    sharpe: 0.4,
  },
  { id: 'riskparity', label: 'Risk parity', weights: [0.55, 0.45], ret: 9, vol: 19, sharpe: 0.33 },
  { id: 'equal', label: 'Equal weight', weights: [0.5, 0.5], ret: 9.5, vol: 20, sharpe: 0.32 },
];

const corr = {
  symbols: ['AAPL', 'MSFT'],
  matrix: [
    [1, 0.4],
    [0.4, 1],
  ],
  observations: 250,
  frequency: 'daily',
  shrinkage: 0.12,
  tooShort: false,
  optimizerStatus: 'no_tangency',
  frontier: [],
  cml: [],
  assets: [
    { label: 'AAPL', ret: 12, vol: 28 },
    { label: 'MSFT', ret: 10, vol: 24 },
  ],
  portfolios,
  rollPoints: [],
  pair: ['AAPL', 'MSFT'],
};

function renderSection(overrides = {}) {
  const props = {
    onAddPeers: vi.fn(),
    peers: [{ symbol: 'MSFT', points: [] }],
    onRemovePeer: vi.fn(),
    loading: false,
    peerErrors: [{ symbol: 'ZZZZ', message: 'Unknown symbol' }],
    frequency: 'daily',
    onFrequencyChange: vi.fn(),
    shrink: true,
    onShrinkChange: vi.fn(),
    cap: 60,
    onCapChange: vi.fn(),
    onPairChange: vi.fn(),
    corr,
    ...overrides,
  };
  render(<CorrelationSection {...props} />);
  return props;
}

describe('CorrelationSection', () => {
  afterEach(() => cleanup());

  it('lists failed peers and the frequency/shrinkage controls', () => {
    const props = renderSection();
    expect(screen.getByText('ZZZZ: Unknown symbol')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }));
    expect(props.onFrequencyChange).toHaveBeenCalledWith('weekly');
    expect(screen.getByText(/shrinkage δ = 0.12/)).toBeTruthy();
  });

  it('keeps long-only and risk-parity portfolios when no tangency exists', () => {
    renderSection();
    expect(screen.getByText('No unconstrained max-Sharpe portfolio')).toBeTruthy();
    expect(screen.getAllByText('Risk parity').length).toBeGreaterThan(0);
    expect(screen.getByText('Portfolio comparison')).toBeTruthy();
  });

  it('changes the rolling-correlation pair', () => {
    const props = renderSection({
      corr: {
        ...corr,
        symbols: ['AAPL', 'MSFT', 'NVDA'],
        matrix: [
          [1, 0.4, 0.5],
          [0.4, 1, 0.6],
          [0.5, 0.6, 1],
        ],
      },
    });
    fireEvent.change(screen.getByLabelText('Second symbol'), { target: { value: 'NVDA' } });
    expect(props.onPairChange).toHaveBeenCalledWith(1, 'NVDA');
  });

  it('draws the frontier with a capital market line when a tangency exists', () => {
    renderSection({
      corr: {
        ...corr,
        optimizerStatus: 'ok',
        frontier: [
          { vol: 18, ret: 8 },
          { vol: 22, ret: 12 },
        ],
        cml: [
          { x: 0, y: 4 },
          { x: 30, y: 16 },
        ],
      },
    });
    expect(screen.getByRole('img', { name: 'Efficient frontier' })).toBeTruthy();
    expect(screen.getByText('Capital market line')).toBeTruthy();
  });

  it('warns when the long-only max-Sharpe portfolio has no positive excess return either', () => {
    renderSection({
      corr: {
        ...corr,
        optimizerStatus: 'lo_negative_excess',
        frontier: [
          { vol: 18, ret: 8 },
          { vol: 22, ret: 12 },
        ],
      },
    });
    expect(screen.getByText('No long-only max-Sharpe portfolio either')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Efficient frontier' })).toBeTruthy();
  });

  it('adds peers from autocomplete picks and typed lists', () => {
    const props = renderSection();
    fireEvent.click(screen.getByText('pick-nvda'));
    expect(props.onAddPeers).toHaveBeenCalledWith(['NVDA']);
    fireEvent.click(screen.getByText('submit-raw'));
    expect(props.onAddPeers).toHaveBeenLastCalledWith(['AMD', 'INTC']);
    expect(screen.getByText('Add peer ticker')).toBeTruthy();
  });
});
