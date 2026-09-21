import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { HistogramChart } from './HistogramChart';

const BAD = /NaN|undefined|Infinity/;

const bins = [
  { binStart: -0.02, binEnd: -0.01, count: 3 },
  { binStart: -0.01, binEnd: 0, count: 10 },
  { binStart: 0, binEnd: 0.01, count: 12 },
  { binStart: 0.01, binEnd: 0.02, count: 5 },
];

const textY = (container, label) =>
  Number(
    [...container.querySelectorAll('text')].find((t) => t.textContent === label).getAttribute('y')
  );

describe('HistogramChart', () => {
  afterEach(() => cleanup());

  it('renders marker labels, overlay legend and a bin tooltip', () => {
    render(
      <HistogramChart
        title="Returns"
        ariaLabel="returns histogram"
        bins={bins}
        formatX={(v) => `${(v * 100).toFixed(1)}%`}
        overlay={{ mu: 0, sigma: 0.01 }}
        markers={[
          { x: -0.015, label: 'VaR 95%', color: '#eab308' },
          { x: Number.NaN, label: 'Ignored', color: '#fff' },
        ]}
      />
    );
    expect(screen.getByText('VaR 95%')).toBeTruthy();
    expect(screen.queryByText('Ignored')).toBeNull();
    expect(screen.getByText('Normal fit')).toBeTruthy();
    fireEvent.mouseMove(screen.getByRole('img', { name: 'returns histogram' }), {
      clientX: 420,
      clientY: 100,
    });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('Count');
  });

  it('empty bins -> empty message', () => {
    render(<HistogramChart title="None" bins={[]} emptyMessage="No returns." />);
    expect(screen.getByText('No returns.')).toBeTruthy();
  });

  it('staggers close markers so their labels do not overlap', () => {
    const { container } = render(
      <HistogramChart
        title="R"
        bins={bins}
        markers={[
          { x: -0.005, label: 'Alpha', color: '#fff' },
          { x: -0.004, label: 'Beta', color: '#fff' },
          { x: -0.003, label: 'Gamma', color: '#fff' },
        ]}
      />
    );
    const ys = ['Alpha', 'Beta', 'Gamma'].map((l) => textY(container, l)).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(12);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(12);
  });

  it('widens the x domain to include markers outside the bins', () => {
    const { container } = render(
      <HistogramChart title="R" bins={bins} markers={[{ x: -0.05, label: 'Far', color: '#fff' }]} />
    );
    const line = container.querySelector('line[stroke-dasharray="4 3"]');
    // Plot left edge is 64px; a marker outside the bins must still land inside the plot.
    expect(Number(line.getAttribute('x1'))).toBeGreaterThanOrEqual(64);
    const firstBar = [...container.querySelectorAll('svg rect')].find((r) =>
      r.getAttribute('opacity')
    );
    expect(Number(firstBar.getAttribute('x'))).toBeGreaterThan(Number(line.getAttribute('x1')));
  });

  it('draws bars with at least 1px width and keeps all-equal counts finite', () => {
    const many = Array.from({ length: 2000 }, (_, i) => ({
      binStart: i,
      binEnd: i + 1,
      count: 4,
    }));
    const { container } = render(<HistogramChart title="Eq" bins={many} />);
    const rects = [...container.querySelectorAll('svg rect')].filter((r) =>
      r.getAttribute('opacity')
    );
    expect(rects).toHaveLength(2000);
    rects.forEach((r) => expect(Number(r.getAttribute('width'))).toBeGreaterThanOrEqual(1));
    expect(container.outerHTML).not.toMatch(BAD);
  });

  it('never emits NaN/undefined/Infinity for degenerate input', () => {
    const cases = [
      { bins: [] },
      { bins: [{ binStart: 0, binEnd: 1, count: 0 }] },
      { bins: [{ binStart: 0, binEnd: 1, count: 7 }] },
      { bins: [{ binStart: NaN, binEnd: 1, count: 7 }] },
      { bins: [{ binStart: 1, binEnd: 1, count: 7 }] },
      { bins, overlay: { mu: 0, sigma: 0 } },
      { bins, overlay: { mu: 0, sigma: NaN } },
      { bins, overlay: { mu: NaN, sigma: 1 } },
      { bins, overlay: { mu: 0, sigma: 1e-320 } },
      { bins, markers: [{ x: Infinity, label: 'Inf', color: '#fff' }] },
      { bins: bins.map((b) => ({ ...b, count: NaN })) },
      { bins: bins.map((b) => ({ ...b, count: 5 })) },
    ];
    cases.forEach((props) => {
      const { container, unmount } = render(<HistogramChart title="Deg" {...props} />);
      expect(container.outerHTML).not.toMatch(BAD);
      unmount();
    });
  });
});
