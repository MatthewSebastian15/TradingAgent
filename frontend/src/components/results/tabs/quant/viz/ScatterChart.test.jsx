import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { ScatterChart } from './ScatterChart';

const BAD = /NaN|undefined|Infinity/;

const textY = (container, label) =>
  Number(
    [...container.querySelectorAll('text')].find((t) => t.textContent === label).getAttribute('y')
  );

describe('ScatterChart', () => {
  afterEach(() => cleanup());

  it('labels points and draws axis titles', () => {
    render(
      <ScatterChart
        title="Frontier"
        ariaLabel="frontier"
        xLabel="Volatility"
        yLabel="Return"
        points={[
          { x: 10, y: 5, label: 'Min-Variance', color: '#3b82f6' },
          { x: 10.2, y: 5.1, label: 'Equal weight', color: '#a3a3a3' },
        ]}
        lines={[
          {
            id: 'f',
            label: 'Frontier',
            color: '#f97316',
            points: [
              { x: 9, y: 4 },
              { x: 15, y: 9 },
            ],
          },
        ]}
      />
    );
    expect(screen.getAllByText('Min-Variance').length).toBeGreaterThan(0);
    expect(screen.getByText('Equal weight')).toBeTruthy();
    expect(screen.getByText('Volatility')).toBeTruthy();
    expect(screen.getByText('Return')).toBeTruthy();
  });

  it('de-collides labels of nearby points', () => {
    const { container } = render(
      <ScatterChart
        title="S"
        points={[
          { x: 10, y: 5, label: 'One', color: '#fff' },
          { x: 10.01, y: 5.01, label: 'Two', color: '#fff' },
          { x: 10.02, y: 5.02, label: 'Three', color: '#fff' },
        ]}
      />
    );
    const ys = ['One', 'Two', 'Three'].map((l) => textY(container, l)).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeGreaterThanOrEqual(12);
    expect(ys[2] - ys[1]).toBeGreaterThanOrEqual(12);
  });

  it('breaks a polyline at non-finite points and skips non-finite scatter points', () => {
    const { container } = render(
      <ScatterChart
        title="S"
        points={[{ x: NaN, y: 1, label: 'Bad', color: '#fff' }]}
        lines={[
          {
            id: 'l',
            color: '#f97316',
            points: [
              { x: 1, y: 1 },
              { x: 2, y: 2 },
              { x: 3, y: NaN },
              { x: 4, y: 4 },
              { x: 5, y: 5 },
            ],
          },
        ]}
      />
    );
    expect(screen.queryByText('Bad')).toBeNull();
    const paths = container.querySelectorAll('path[stroke="#f97316"]');
    expect(paths).toHaveLength(2);
    paths.forEach((path) => expect(path.getAttribute('d').match(/M/g)).toHaveLength(1));
    expect(container.outerHTML).not.toMatch(BAD);
  });

  it('shows a tooltip only near a point', () => {
    render(
      <ScatterChart
        title="S"
        ariaLabel="sc"
        xLabel="Vol"
        yLabel="Ret"
        points={[
          { x: 0, y: 0, label: 'A', color: '#fff' },
          { x: 10, y: 10, label: 'B', color: '#fff' },
        ]}
      />
    );
    const svg = screen.getByRole('img', { name: 'sc' });
    // Middle of the plot, far from both corner points -> no tooltip.
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 120 });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    // On point B (x max, y max).
    fireEvent.mouseMove(svg, { clientX: 555, clientY: 64 });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('B');
  });

  it('never emits NaN/undefined/Infinity for degenerate input', () => {
    const one = { x: 3, y: 3, label: 'P', color: '#fff' };
    const cases = [
      {},
      { points: [] },
      { points: [one] },
      { points: [one, { ...one, label: 'Q' }, { ...one, label: 'R' }] },
      { points: [{ x: Infinity, y: 1, color: '#fff' }] },
      { points: [{ ...one, radius: NaN }] },
      { lines: [{ id: 'l', color: '#fff', points: [{ x: 1, y: 1 }] }] },
      {
        lines: [
          {
            id: 'l',
            color: '#fff',
            points: [
              { x: 2, y: 2 },
              { x: 2, y: 2 },
            ],
          },
        ],
      },
      { lines: [{ id: 'l', color: '#fff' }] },
    ];
    cases.forEach((props) => {
      const { container, unmount } = render(<ScatterChart title="Deg" {...props} />);
      expect(container.outerHTML).not.toMatch(BAD);
      unmount();
    });
  });
});
