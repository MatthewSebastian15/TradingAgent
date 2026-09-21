import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HeadlineStrip } from './HeadlineStrip';

const props = {
  symbol: 'AAPL',
  ccy: 'USD',
  last: 182.4,
  changePct: 12.3,
  startDate: '2025-09-12',
  endDate: '2026-09-11',
  observations: 251,
  benchLabel: 'S&P 500',
  rfPct: 4,
  rfSource: 'market',
  issues: [
    {
      code: 'extreme_move',
      count: 1,
      dates: ['2026-01-05'],
      message: '1 daily move(s) beyond ±40% (possible unadjusted split).',
    },
  ],
  vol: 25,
  shp: 1.2,
  dd: -18,
  var95: -2.1,
  regime: { label: 'Normal', tone: 'neutral' },
  hurstVal: 0.52,
};

describe('HeadlineStrip', () => {
  afterEach(() => cleanup());

  it('shows the data window, price, benchmark and warnings', () => {
    render(<HeadlineStrip {...props} onRfChange={vi.fn()} />);
    expect(screen.getByText('2025-09-12 → 2026-09-11 · 251 obs')).toBeTruthy();
    expect(screen.getByText('USD 182.40')).toBeTruthy();
    expect(screen.getByText('S&P 500')).toBeTruthy();
    expect(screen.getByText('Vol Regime')).toBeTruthy();
    expect(screen.getByText(/possible unadjusted split/)).toBeTruthy();
  });

  it('reports a manual risk-free rate as a fraction', () => {
    const onRfChange = vi.fn();
    render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    fireEvent.change(screen.getByLabelText('Risk-free rate, annual percent'), {
      target: { value: '4.5' },
    });
    expect(onRfChange.mock.calls[0][0]).toBeCloseTo(0.045, 12);
  });

  it.each([
    ['market', 'market default'],
    ['global', 'global default'],
    ['none', 'not configured'],
    ['manual', 'manual'],
  ])('labels the %s risk-free source', (rfSource, label) => {
    render(<HeadlineStrip {...props} rfSource={rfSource} onRfChange={vi.fn()} />);
    expect(screen.getByText(label)).toBeTruthy();
  });

  it('ignores out-of-range risk-free values', () => {
    const onRfChange = vi.fn();
    render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    const input = screen.getByLabelText('Risk-free rate, annual percent');
    fireEvent.change(input, { target: { value: '150' } });
    fireEvent.change(input, { target: { value: '-1' } });
    expect(onRfChange).not.toHaveBeenCalled();
  });

  it('accepts the 0 and 100 boundaries', () => {
    const onRfChange = vi.fn();
    render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    const input = screen.getByLabelText('Risk-free rate, annual percent');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.change(input, { target: { value: '100' } });
    expect(onRfChange.mock.calls).toEqual([[0], [1]]);
  });

  it('lets the field be cleared and reports null (use the default)', () => {
    const onRfChange = vi.fn();
    render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    const input = screen.getByLabelText('Risk-free rate, annual percent');
    fireEvent.change(input, { target: { value: '' } });
    expect(onRfChange).toHaveBeenCalledWith(null);
    expect(input.value).toBe('');
  });

  it('resyncs the draft when the parent rate changes with the symbol', () => {
    const { rerender } = render(<HeadlineStrip {...props} onRfChange={vi.fn()} />);
    const input = screen.getByLabelText('Risk-free rate, annual percent');
    fireEvent.change(input, { target: { value: '' } });
    rerender(<HeadlineStrip {...props} symbol="BBCA.JK" rfPct={6} onRfChange={vi.fn()} />);
    expect(input.value).toBe('6');
  });

  it('does not throw on a non-finite rfPct', () => {
    render(<HeadlineStrip {...props} rfPct={NaN} onRfChange={vi.fn()} />);
    expect(screen.getByLabelText('Risk-free rate, annual percent').value).toBe('');
  });

  it('shows the reset button only for a manual rate and resets to default', () => {
    const onRfChange = vi.fn();
    const { rerender } = render(<HeadlineStrip {...props} onRfChange={onRfChange} />);
    expect(screen.queryByRole('button', { name: /reset risk-free/i })).toBeNull();

    rerender(<HeadlineStrip {...props} rfSource="manual" onRfChange={onRfChange} />);
    fireEvent.click(screen.getByRole('button', { name: /reset risk-free/i }));
    expect(onRfChange).toHaveBeenCalledWith(null);
  });

  it('puts the full window and benchmark in title attributes', () => {
    render(<HeadlineStrip {...props} onRfChange={vi.fn()} />);
    expect(screen.getByText('2025-09-12 → 2026-09-11 · 251 obs').getAttribute('title')).toBe(
      '2025-09-12 → 2026-09-11 · 251 obs'
    );
    expect(screen.getByText('S&P 500').getAttribute('title')).toBe('S&P 500');
  });
});
