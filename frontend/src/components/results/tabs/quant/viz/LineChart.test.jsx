import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { LineChart } from './LineChart';

const dates = ['2026-01-02', '2026-01-05', '2026-01-06', '2026-01-07'];
const BAD = /NaN|undefined|Infinity/;

describe('LineChart', () => {
  afterEach(() => cleanup());

  it('draws labeled series with formatted y ticks and a date tooltip', () => {
    render(
      <LineChart
        title="Equity"
        ariaLabel="equity chart"
        formatY={(v) => `${v.toFixed(1)}x`}
        series={[
          {
            id: 'a',
            label: 'Strategy',
            color: '#f97316',
            points: dates.map((d, i) => ({ x: d, y: 1 + i * 0.1 })),
          },
          {
            id: 'b',
            label: 'Buy & hold',
            color: '#a3a3a3',
            points: dates.map((d, i) => ({ x: d, y: 1 + i * 0.05 })),
          },
        ]}
        referenceLines={[{ y: 1, label: 'Start', color: '#525252' }]}
      />
    );
    expect(screen.getByText('Strategy')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getAllByText(/x$/).length).toBeGreaterThan(1);
    fireEvent.mouseMove(screen.getByRole('img', { name: 'equity chart' }), {
      clientX: 700,
      clientY: 50,
    });
    const tip = screen.getByTestId('chart-tooltip').textContent;
    expect(tip).toContain('2026-01-07');
    expect(tip).toContain('Strategy');
    expect(tip).toContain('Buy & hold');
  });

  it('hides series flagged hideInLegend from legend and tooltip', () => {
    render(
      <LineChart
        title="Fan"
        ariaLabel="fan"
        xType="number"
        series={[
          {
            id: 'p',
            label: 'Path',
            color: '#333',
            hideInLegend: true,
            points: [
              { x: 0, y: 1 },
              { x: 5, y: 2 },
            ],
          },
          {
            id: 'm',
            label: 'Median',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 5, y: 1.5 },
            ],
          },
        ]}
      />
    );
    expect(screen.queryByText('Path')).toBeNull();
    expect(screen.getByText('Median')).toBeTruthy();
    fireEvent.mouseMove(screen.getByRole('img', { name: 'fan' }), { clientX: 400, clientY: 50 });
    expect(screen.getByTestId('chart-tooltip').textContent).not.toContain('Path');
  });

  it('shows the empty message with fewer than two points', () => {
    render(
      <LineChart
        title="Empty"
        series={[{ id: 'a', color: '#fff', points: [{ x: '2026-01-02', y: 1 }] }]}
        emptyMessage="No data."
      />
    );
    expect(screen.getByText('No data.')).toBeTruthy();
  });

  it('breaks the path at null/NaN gaps instead of drawing to zero', () => {
    const { container } = render(
      <LineChart
        title="Gaps"
        ariaLabel="gaps"
        xType="number"
        series={[
          {
            id: 'g',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 1, y: 2 },
              { x: 2, y: null },
              { x: 3, y: NaN },
              { x: 4, y: 3 },
              { x: 5, y: 4 },
              { x: 6, y: undefined },
              { x: 7, y: 5 },
            ],
          },
        ]}
      />
    );
    const d = container.querySelector('path[stroke="#f97316"]').getAttribute('d');
    expect(d).not.toMatch(BAD);
    expect(d.match(/M/g)).toHaveLength(2);
    // the trailing single point is drawn as a dot
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(container.outerHTML).not.toMatch(BAD);
  });

  it('sorts unsorted x so the path does not zigzag back', () => {
    const { container } = render(
      <LineChart
        title="Unsorted"
        xType="number"
        series={[
          {
            id: 'u',
            color: '#f97316',
            points: [
              { x: 5, y: 3 },
              { x: 0, y: 1 },
              { x: 2, y: 2 },
            ],
          },
        ]}
      />
    );
    const d = container.querySelector('path[stroke="#f97316"]').getAttribute('d');
    const xs = [...d.matchAll(/[ML]([\d.]+),/g)].map((m) => Number(m[1]));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('drops non-positive values on a log axis without emitting bad attributes', () => {
    const { container } = render(
      <LineChart
        title="Log"
        xType="number"
        yScaleType="log"
        referenceLines={[{ y: 0, label: 'Zero', color: '#525252' }]}
        series={[
          {
            id: 'l',
            color: '#f97316',
            points: [
              { x: 0, y: 0 },
              { x: 1, y: 1 },
              { x: 2, y: -3 },
              { x: 3, y: 10 },
              { x: 4, y: 100 },
            ],
          },
        ]}
      />
    );
    expect(container.outerHTML).not.toMatch(BAD);
    expect(container.querySelector('path[stroke="#f97316"]')).toBeTruthy();
    expect(container.querySelectorAll('svg[role="img"] line[stroke="#525252"]')).toHaveLength(0);
  });

  it('draws bands, regions, vertical lines and skips out-of-range ones', () => {
    const { container } = render(
      <LineChart
        title="Layers"
        xType="number"
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 2 },
            ],
          },
        ]}
        bands={[
          {
            id: 'b',
            label: 'Range',
            color: 'rgba(1,2,3,0.2)',
            points: [
              { x: 0, lo: 0.5, hi: 1.5 },
              { x: 10, lo: 1.5, hi: 2.5 },
            ],
          },
        ]}
        regions={[
          { from: 2, to: 4, color: '#3b82f6', label: 'Stress' },
          { from: 20, to: 30, color: '#ef4444' },
        ]}
        verticalLines={[
          { x: 5, label: 'Event', color: '#eab308' },
          { x: 99, color: '#eab308' },
          { x: null, color: '#eab308' },
        ]}
      />
    );
    expect(screen.getByText('Range')).toBeTruthy();
    expect(screen.getByText('Stress')).toBeTruthy();
    expect(container.querySelectorAll('rect[opacity="0.22"]')).toHaveLength(1);
    expect(container.querySelectorAll('svg[role="img"] line[stroke="#eab308"]')).toHaveLength(1);
    expect(container.outerHTML).not.toMatch(BAD);
  });

  it('staggers overlapping marker labels', () => {
    const { container } = render(
      <LineChart
        title="Markers"
        xType="number"
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 2 },
            ],
          },
        ]}
        markers={[
          { x: 5, y: 1.5, shape: 'up', color: '#22c55e', label: 'Buy A' },
          { x: 5, y: 1.5, shape: 'up', color: '#22c55e', label: 'Buy B' },
          { x: 5, y: 1.5, shape: 'up', color: '#22c55e', label: 'Buy C' },
          { x: 6, y: 1.6, shape: 'dot', color: '#eab308', label: 'Dot' },
          { x: NaN, y: 1, shape: 'dot', color: '#eab308', label: 'Bad' },
        ]}
      />
    );
    const ys = ['Buy A', 'Buy B', 'Buy C']
      .map((t) => Number(screen.getByText(t, { selector: 'text' }).getAttribute('y')))
      .sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(12);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(12);
    expect(container.querySelectorAll('circle')).toHaveLength(1);
    expect(screen.queryByText('Bad', { selector: 'text' })).toBeNull();
    expect(container.outerHTML).not.toMatch(BAD);
  });

  it('applies a custom formatX to tooltip title and date ticks', () => {
    render(
      <LineChart
        title="Fmt"
        ariaLabel="fmt"
        formatX={(iso) => `D:${iso}`}
        series={[
          { id: 'a', label: 'A', color: '#f97316', points: dates.map((d, i) => ({ x: d, y: i })) },
        ]}
      />
    );
    fireEvent.mouseMove(screen.getByRole('img', { name: 'fmt' }), { clientX: 700, clientY: 50 });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('D:2026-01-07');
  });

  it('splits bands into runs at gaps instead of bridging them', () => {
    const { container } = render(
      <LineChart
        title="Band gaps"
        xType="number"
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 4, y: 2 },
            ],
          },
        ]}
        bands={[
          {
            id: 'b',
            label: 'Range',
            color: 'rgba(1,2,3,0.2)',
            points: [
              { x: 0, lo: 0.5, hi: 1.5 },
              { x: 1, lo: 0.6, hi: 1.6 },
              { x: 2, lo: null, hi: 1.7 },
              { x: 3, lo: 0.8, hi: 1.8 },
              { x: 4, lo: 0.9, hi: Number.NaN },
              { x: 5, lo: 0.9, hi: 1.9 },
              { x: 6, lo: 1, hi: 2 },
            ],
          },
        ]}
      />
    );
    const d = container.querySelector('path[fill="rgba(1,2,3,0.2)"]').getAttribute('d');
    // runs: [0,1] and [5,6]; the lone point at x=3 draws nothing
    expect(d.match(/M/g)).toHaveLength(2);
    expect(d.match(/Z/g)).toHaveLength(2);
    expect(d).not.toMatch(BAD);
  });

  it('shows an em dash for a series or band with no valid point at the snapped x', () => {
    render(
      <LineChart
        title="Sparse"
        ariaLabel="sparse"
        xType="number"
        formatY={(v) => `v${v}`}
        series={[
          {
            id: 'p',
            label: 'Dense',
            color: '#f97316',
            points: [0, 1, 2, 3].map((x) => ({ x, y: x + 1 })),
          },
          {
            id: 'q',
            label: 'Sparse',
            color: '#a3a3a3',
            points: [
              { x: 0, y: 10 },
              { x: 1, y: null },
              { x: 3, y: 30 },
            ],
          },
        ]}
        bands={[
          {
            id: 'b',
            label: 'Band',
            color: 'rgba(1,2,3,0.2)',
            points: [
              { x: 0, lo: 1, hi: 2 },
              { x: 3, lo: 3, hi: 4 },
            ],
          },
        ]}
      />
    );
    // plot spans 64..704 for x in 0..3: x = 1 sits at px ~277
    fireEvent.mouseMove(screen.getByRole('img', { name: 'sparse' }), { clientX: 277, clientY: 50 });
    const rows = [...screen.getByTestId('chart-tooltip').querySelectorAll('div > span:last-child')];
    expect(rows.map((r) => r.textContent)).toEqual(['v2', '—', '—']);
  });

  it('includes marker values in the y extent so they are not dropped', () => {
    const { container } = render(
      <LineChart
        title="Marker extent"
        xType="number"
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 2 },
            ],
          },
        ]}
        markers={[{ x: 5, y: 9, shape: 'dot', color: '#eab308', label: 'High' }]}
      />
    );
    expect(container.querySelectorAll('circle[fill="#eab308"]')).toHaveLength(1);
    expect(screen.getByText('High', { selector: 'text' })).toBeTruthy();
  });

  it('keeps stacked marker labels apart at the bottom edge', () => {
    render(
      <LineChart
        title="Bottom"
        xType="number"
        height={120}
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 5 },
            ],
          },
        ]}
        markers={['A', 'B', 'C', 'D'].map((label) => ({
          x: 5,
          y: 1,
          shape: 'up',
          color: '#22c55e',
          label,
        }))}
      />
    );
    const ys = ['A', 'B', 'C', 'D']
      .map((t) => Number(screen.getByText(t, { selector: 'text' }).getAttribute('y')))
      .sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i += 1) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(12);
    // plot.bottom = 120 - 26 = 94
    expect(ys.at(-1)).toBeLessThanOrEqual(92);
  });

  it('keeps a crowded marker stack inside the plot', () => {
    const labels = Array.from({ length: 14 }, (_, i) => `m${i}`);
    render(
      <LineChart
        title="Crowded"
        xType="number"
        height={120}
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 5 },
            ],
          },
        ]}
        markers={labels.map((label) => ({ x: 5, y: 1, shape: 'up', color: '#22c55e', label }))}
      />
    );
    for (const l of labels) {
      const y = Number(screen.getByText(l, { selector: 'text' }).getAttribute('y'));
      expect(y).toBeGreaterThanOrEqual(20);
      expect(y).toBeLessThanOrEqual(92);
    }
  });

  it('ignores the y of a marker outside the x extent', () => {
    const { container } = render(
      <LineChart
        title="Off-range marker"
        xType="number"
        series={[
          {
            id: 's',
            color: '#f97316',
            points: [
              { x: 0, y: 1 },
              { x: 10, y: 2 },
            ],
          },
        ]}
        markers={[{ x: 99, y: 1000, shape: 'dot', color: '#eab308', label: 'Far' }]}
      />
    );
    // The marker is never drawn, so it must not stretch the y axis to 1000.
    const tickLabels = [...container.querySelectorAll('svg text')].map((t) => t.textContent);
    expect(tickLabels.some((t) => Number.parseFloat(t) > 100)).toBe(false);
    expect(container.querySelectorAll('circle[fill="#eab308"]')).toHaveLength(0);
  });

  it('never emits NaN/undefined/Infinity for degenerate input', () => {
    const cases = [
      { series: [] },
      { series: [{ id: 'a', color: '#fff', points: [{ x: 'garbage', y: 1 }] }] },
      {
        series: [
          {
            id: 'a',
            color: '#fff',
            points: [
              { x: '2026-01-01', y: Infinity },
              { x: '2026-01-02', y: NaN },
            ],
          },
        ],
      },
      {
        yScaleType: 'log',
        series: [
          {
            id: 'a',
            color: '#fff',
            points: [
              { x: '2026-01-01', y: 0 },
              { x: '2026-01-02', y: -1 },
            ],
          },
        ],
      },
      {
        series: [
          {
            id: 'a',
            color: '#fff',
            points: [
              { x: '2026-01-01', y: 5 },
              { x: '2026-01-01', y: 5 },
            ],
          },
        ],
      },
    ];
    cases.forEach((props) => {
      const { container, unmount } = render(<LineChart title="Deg" {...props} />);
      expect(container.outerHTML).not.toMatch(BAD);
      unmount();
    });
  });
});
