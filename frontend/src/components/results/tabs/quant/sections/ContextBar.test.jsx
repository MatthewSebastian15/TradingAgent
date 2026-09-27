import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { benchmarkBySymbol, BENCHMARK_OPTIONS } from '../benchmark';
import { ContextBar } from './ContextBar';

const props = {
  symbol: 'AAPL',
  ccy: 'USD',
  last: 182.4,
  changePct: 12.3,
  startDate: '2025-09-12',
  endDate: '2026-09-11',
  observations: 251,
  benchSymbol: '^GSPC',
  rfPct: 4,
  rfSource: 'market',
  status: { label: 'OK', reasons: [] },
  sticky: true,
};

describe('ContextBar', () => {
  afterEach(() => cleanup());

  it('shows the context and sticks under the navbar', () => {
    const { container } = render(
      <ContextBar {...props} onBenchChange={vi.fn()} onRfChange={vi.fn()} />
    );
    expect(screen.getByText('2025-09-12 → 2026-09-11 · 251 obs')).toBeTruthy();
    expect(screen.getByText('USD 182.40')).toBeTruthy();
    expect(screen.getByText('DATA OK')).toBeTruthy();
    expect(container.firstChild.className).toContain('sticky');
  });

  it('switches the benchmark and the risk-free rate', () => {
    const onBenchChange = vi.fn();
    const onRfChange = vi.fn();
    render(<ContextBar {...props} onBenchChange={onBenchChange} onRfChange={onRfChange} />);
    fireEvent.change(screen.getByLabelText('Benchmark'), { target: { value: '^JKSE' } });
    expect(onBenchChange).toHaveBeenCalledWith('^JKSE');
    fireEvent.change(screen.getByLabelText('Risk-free rate, annual percent'), {
      target: { value: '4.5' },
    });
    expect(onRfChange.mock.calls[0][0]).toBeCloseTo(0.045, 12);
  });

  it('flags limited data in amber with reasons', () => {
    render(
      <ContextBar
        {...props}
        status={{ label: 'LIMITED', reasons: ['benchmark unavailable'] }}
        onBenchChange={vi.fn()}
        onRfChange={vi.fn()}
      />
    );
    expect(screen.getByText('LIMITED').className).toContain('text-bloomberg-amber');
    expect(screen.getByRole('button', { name: 'About data status' })).toBeTruthy();
  });

  it('exposes benchmark options', () => {
    expect(BENCHMARK_OPTIONS[0]).toEqual({ symbol: '^GSPC', label: 'S&P 500' });
    expect(benchmarkBySymbol('^JKSE').label).toBe('IDX Composite');
    expect(benchmarkBySymbol('NOPE')).toBeNull();
  });
});
