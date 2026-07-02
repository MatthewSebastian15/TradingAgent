import { cleanup, render, screen } from '@testing-library/react';
import PropTypes from 'prop-types';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import QuantTab from './QuantTab';

vi.mock('./QuantPanel', () => {
  function QuantPanelStub({ points, currency, symbol }) {
    return (
      <div data-testid="quant-panel">
        {symbol}|{currency}|{points.length}
      </div>
    );
  }
  QuantPanelStub.propTypes = {
    points: PropTypes.array.isRequired,
    currency: PropTypes.string,
    symbol: PropTypes.string,
  };
  return { default: QuantPanelStub };
});

describe('QuantTab', () => {
  afterEach(() => cleanup());

  it('passes the price series, currency, and normalized ticker to QuantPanel', () => {
    const result = {
      ticker: 'aapl',
      normalized_ticker: 'AAPL',
      price_chart: {
        currency: 'USD',
        points: [{ date: '2026-01-01', close: 100 }],
      },
    };
    render(<QuantTab result={result} />);

    expect(screen.getByTestId('quant-panel').textContent).toBe('AAPL|USD|1');
  });

  it('falls back to empty points, result currency, and raw ticker', () => {
    render(<QuantTab result={{ ticker: 'BBCA.JK', currency: 'IDR' }} />);

    expect(screen.getByTestId('quant-panel').textContent).toBe('BBCA.JK|IDR|0');
  });
});
