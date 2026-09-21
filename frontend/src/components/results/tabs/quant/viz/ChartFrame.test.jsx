import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChartFrame } from './ChartFrame';

const baseProps = {
  title: 'Test chart',
  ariaLabel: 'test chart',
  xDomain: [0, 10],
  yDomain: [0, 100],
  xTicks: [
    { value: 0, label: 'start' },
    { value: 10, label: 'end' },
  ],
  yTicks: [
    { value: 0, label: 'zero' },
    { value: 100, label: 'hundred' },
  ],
  legend: [{ label: 'Series A', color: '#f97316' }],
  renderPlot: ({ x, y }) => <circle data-testid="mark" cx={x(5)} cy={y(50)} r={3} />,
};

describe('ChartFrame', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders ticks, legend and marks at real pixel width', () => {
    render(<ChartFrame {...baseProps} />);
    expect(screen.getByText('start')).toBeTruthy();
    expect(screen.getByText('hundred')).toBeTruthy();
    expect(screen.getByText('Series A')).toBeTruthy();
    const svg = screen.getByRole('img', { name: 'test chart' });
    expect(svg.getAttribute('viewBox')).toBe('0 0 720 240');
    expect(svg.getAttribute('preserveAspectRatio')).toBeNull();
    expect(Number(screen.getByTestId('mark').getAttribute('cx'))).toBeGreaterThan(64);
  });

  it('shows a tooltip on hover inside the plot', () => {
    render(
      <ChartFrame
        {...baseProps}
        getTooltip={(xv) => ({
          x: Math.round(xv),
          title: `x=${Math.round(xv)}`,
          rows: [{ label: 'A', value: '1' }],
        })}
      />
    );
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 380,
      clientY: 100,
    });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('x=');
  });

  it('hides the tooltip outside the plot and on mouse leave', () => {
    render(<ChartFrame {...baseProps} getTooltip={() => ({ title: 't', rows: [] })} />);
    const svg = screen.getByRole('img', { name: 'test chart' });
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 100 });
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    fireEvent.mouseMove(svg, { clientX: 10, clientY: 100 });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 100 });
    fireEvent.mouseLeave(svg);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('maps pointer position to the viewBox when the svg is CSS-scaled', () => {
    const getTooltip = vi.fn(() => null);
    render(<ChartFrame {...baseProps} getTooltip={getTooltip} />);
    const svg = screen.getByRole('img', { name: 'test chart' });
    svg.getBoundingClientRect = () => ({ left: 10, top: 0, width: 360, height: 120 });
    fireEvent.mouseMove(svg, { clientX: 190, clientY: 60 });
    // px = (190 - 10) * 720 / 360 = 360 -> x = (360 - 64) / (704 - 64) * 10
    expect(getTooltip.mock.calls[0][0]).toBeCloseTo(4.625, 5);
  });

  it('anchors the tooltip to the right edge near the right side of the plot', () => {
    render(<ChartFrame {...baseProps} getTooltip={() => ({ x: 10, title: 't', rows: [] })} />);
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 700,
      clientY: 100,
    });
    const style = screen.getByTestId('chart-tooltip').style;
    expect(style.right).not.toBe('');
    expect(style.left).toBe('');
  });

  it('renders the empty message instead of an svg', () => {
    render(<ChartFrame {...baseProps} isEmpty emptyMessage="Nothing yet." />);
    expect(screen.getByText('Nothing yet.')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('falls back to the empty message for a non-finite domain', () => {
    render(<ChartFrame {...baseProps} xDomain={[NaN, NaN]} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Not enough data for this chart.')).toBeTruthy();
  });

  it('never emits NaN or undefined attributes for degenerate input', () => {
    const { container } = render(
      <ChartFrame
        {...baseProps}
        xDomain={[5, 5]}
        yDomain={[0, 0]}
        yScaleType="log"
        xTicks={[{ value: 5, label: 'only' }]}
        yTicks={[{ value: Number.NaN, label: 'bad' }]}
      />
    );
    const markup = container.querySelector('svg[role="img"]').outerHTML;
    expect(markup).not.toMatch(/NaN|undefined|Infinity/);
    expect(screen.getByText('only')).toBeTruthy();
    expect(screen.queryByText('bad')).toBeNull();
  });

  it('measures the container with ResizeObserver and disconnects on unmount', () => {
    const disconnect = vi.fn();
    let notify;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb) {
          notify = cb;
        }
        observe() {}
        disconnect() {
          disconnect();
        }
      }
    );
    const { unmount } = render(<ChartFrame {...baseProps} />);
    act(() => notify([{ contentRect: { width: 400.4 } }]));
    expect(screen.getByRole('img', { name: 'test chart' }).getAttribute('viewBox')).toBe(
      '0 0 400 240'
    );
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('measures the plot after switching from empty to data', () => {
    const observed = [];
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe(el) {
          observed.push(el);
        }
        disconnect() {}
      }
    );
    const { rerender } = render(<ChartFrame {...baseProps} isEmpty />);
    rerender(<ChartFrame {...baseProps} />);
    // the observed container must survive the empty -> data switch
    expect(observed.length).toBe(1);
    expect(observed[0].isConnected).toBe(true);
  });
});
