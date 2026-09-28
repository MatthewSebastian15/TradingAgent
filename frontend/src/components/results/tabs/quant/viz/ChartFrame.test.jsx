import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    vi.restoreAllMocks();
  });
  it('widens the left margin so long y tick labels are not clipped', () => {
    const label = 'USD 600.00';
    render(
      <ChartFrame
        {...baseProps}
        yTicks={[
          { value: 0, label },
          { value: 100, label: 'USD 200.00' },
        ]}
      />
    );
    const text = screen.getByText(label);
    // Tick text is end-anchored at x, so x must leave room for the whole label (~6.2px per char).
    expect(Number(text.getAttribute('x'))).toBeGreaterThanOrEqual(label.length * 6.2);
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

  const stubObserver = () => {
    const ctl = {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(cb) {
          ctl.notify = (width) => act(() => cb([{ contentRect: { width } }]));
        }
        observe() {}
        disconnect() {}
      }
    );
    return ctl;
  };
  const stubTooltipWidth = (px) =>
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(px);
  const tip = (over = {}) => ({ x: 5, title: 't', rows: [{ label: 'A', value: '1' }], ...over });

  it('keeps the tooltip inside a narrow container (left side)', () => {
    const ctl = stubObserver();
    stubTooltipWidth(200);
    render(<ChartFrame {...baseProps} getTooltip={() => tip()} />);
    ctl.notify(320);
    // px 190 is <= 0.6 * 320 so it is placed to the right: 198 + 200 would overflow 320.
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 190,
      clientY: 100,
    });
    const el = screen.getByTestId('chart-tooltip');
    expect(Number.parseFloat(el.style.left)).toBeLessThanOrEqual(320 - 200 - 8);
    expect(Number.parseFloat(el.style.left)).toBeGreaterThanOrEqual(8);
    expect(el.style.maxWidth).toBe('304px');
  });

  it('keeps the tooltip inside a narrow container (right side)', () => {
    const ctl = stubObserver();
    stubTooltipWidth(300);
    // x(5.7) = 64 + 5.7 * 24 = 200.8 is > 0.6 * 320, so it flips to the left of the pointer.
    render(<ChartFrame {...baseProps} getTooltip={() => tip({ x: 5.7 })} />);
    ctl.notify(320);
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 200,
      clientY: 100,
    });
    const el = screen.getByTestId('chart-tooltip');
    expect(el.style.left).toBe('');
    const right = Number.parseFloat(el.style.right);
    // Unclamped, right would be 320 - 200.8 + 8 = 127.2 and the 300px box would start at -107.
    expect(320 - right - 300).toBeGreaterThanOrEqual(8); // left edge
    expect(320 - right).toBeLessThanOrEqual(320 - 8); // right edge
  });

  it('measures the tooltip at its natural width, capped by max-width', () => {
    render(<ChartFrame {...baseProps} getTooltip={() => tip()} />);
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 380,
      clientY: 100,
    });
    const el = screen.getByTestId('chart-tooltip');
    // w-max stops the absolutely positioned box shrinking (and wrapping) near an edge.
    expect(el.className).toContain('w-max');
    expect(el.style.maxWidth).toBe('704px');
  });

  it('clears a stale tooltip when the domain, width or empty state changes', () => {
    const ctl = stubObserver();
    const getTooltip = () => tip();
    const { rerender } = render(<ChartFrame {...baseProps} getTooltip={getTooltip} />);
    const svg = () => screen.getByRole('img', { name: 'test chart' });
    fireEvent.mouseMove(svg(), { clientX: 380, clientY: 100 });
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    rerender(<ChartFrame {...baseProps} yDomain={[0, 200]} getTooltip={getTooltip} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.mouseMove(svg(), { clientX: 380, clientY: 100 });
    ctl.notify(500);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.mouseMove(svg(), { clientX: 380, clientY: 100 });
    rerender(<ChartFrame {...baseProps} isEmpty getTooltip={getTooltip} />);
    rerender(<ChartFrame {...baseProps} getTooltip={getTooltip} />);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('ignores hover above or below the plot (tick label strip)', () => {
    render(<ChartFrame {...baseProps} getTooltip={() => tip()} />);
    const svg = screen.getByRole('img', { name: 'test chart' });
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 100 });
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 225 }); // below plot.bottom (214)
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 380, clientY: 4 }); // above plot.top (12)
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('tolerates a tooltip without rows and duplicate labels', () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ChartFrame
        {...baseProps}
        legend={[
          { label: 'Same', color: '#fff' },
          { label: 'Same', color: '#000' },
        ]}
        getTooltip={() =>
          tip({
            rows: [
              { label: 'Dup', value: '1' },
              { label: 'Dup', value: '2' },
            ],
          })
        }
      />
    );
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 380,
      clientY: 100,
    });
    expect(screen.getAllByText('Dup')).toHaveLength(2);
    expect(errors).not.toHaveBeenCalled();
    cleanup();
    render(<ChartFrame {...baseProps} getTooltip={() => ({ title: 'no rows' })} />);
    fireEvent.mouseMove(screen.getByRole('img', { name: 'test chart' }), {
      clientX: 380,
      clientY: 100,
    });
    expect(screen.getByTestId('chart-tooltip').textContent).toContain('no rows');
    errors.mockRestore();
  });

  it('lets the root shrink inside flex/grid parents', () => {
    const { container } = render(<ChartFrame {...baseProps} />);
    expect(container.querySelector('figure').className).toContain('min-w-0');
  });

  it('keeps the fallback width at 0 (hidden tab) and recovers once measured', () => {
    const ctl = stubObserver();
    render(<ChartFrame {...baseProps} />);
    const viewBox = () => screen.getByRole('img', { name: 'test chart' }).getAttribute('viewBox');
    ctl.notify(0);
    expect(viewBox()).toBe('0 0 720 240');
    ctl.notify(360);
    expect(viewBox()).toBe('0 0 360 240');
  });

  it('draws box and dashed legend swatches', () => {
    const { container } = render(
      <ChartFrame
        {...baseProps}
        legend={[
          { label: 'Area', color: '#111111', swatch: 'box' },
          { label: 'Dashed', color: '#222222', dashed: true },
          { label: 'Solid', color: '#333333' },
        ]}
      />
    );
    const items = container.querySelectorAll('ul li');
    expect(items[0].querySelector('rect').getAttribute('fill')).toBe('#111111');
    expect(items[1].querySelector('line').getAttribute('stroke-dasharray')).toBe('3 2');
    expect(items[2].querySelector('line').getAttribute('stroke-dasharray')).toBeNull();
  });

  it('renders note and axis titles', () => {
    render(<ChartFrame {...baseProps} xLabel="Days" yLabel="Value" note="Simulated." />);
    expect(screen.getByText('Simulated.')).toBeTruthy();
    expect(screen.getByText('Days')).toBeTruthy();
    expect(screen.getByText('Value').getAttribute('transform')).toContain('rotate(-90');
  });

  it('does not rebuild the plot on hover-only re-renders', () => {
    const renderPlot = vi.fn(baseProps.renderPlot);
    render(<ChartFrame {...baseProps} renderPlot={renderPlot} getTooltip={() => tip()} />);
    const svg = screen.getByRole('img', { name: 'test chart' });
    const before = renderPlot.mock.calls.length;
    fireEvent.mouseMove(svg, { clientX: 300, clientY: 100 });
    fireEvent.mouseMove(svg, { clientX: 400, clientY: 100 });
    expect(renderPlot.mock.calls.length).toBe(before);
  });
});

vi.mock('../exporters', async (importOriginal) => ({
  ...(await importOriginal()),
  downloadText: vi.fn(),
  downloadBlob: vi.fn(),
  svgToPngBlob: vi.fn(async () => new Blob(['png'])),
}));

describe('ChartFrame toolbar', () => {
  afterEach(() => cleanup());

  const table = {
    columns: [
      { key: 'x', label: 'Date', render: (r) => r.x },
      { key: 'y', label: 'Value', align: 'right', render: (r) => String(r.y) },
    ],
    rows: [{ x: '2026-01-02', y: 5 }],
  };

  it('switches to a data table and exports CSV', async () => {
    const { downloadText } = await import('../exporters');
    render(<ChartFrame {...baseProps} table={table} />);
    const toggle = screen.getByRole('button', { name: 'View Test chart as table' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('img', { name: 'test chart' })).toBeNull();
    expect(screen.getByText('2026-01-02')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download Test chart as CSV' }));
    expect(downloadText).toHaveBeenCalledWith('Test-chart.csv', 'Date,Value\r\n2026-01-02,5');
    expect(screen.queryByRole('button', { name: 'Download Test chart as PNG' })).toBeNull();
  });

  it('exports the chart as PNG', async () => {
    const { downloadBlob, svgToPngBlob } = await import('../exporters');
    render(<ChartFrame {...baseProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Download Test chart as PNG' }));
    await waitFor(() =>
      expect(downloadBlob).toHaveBeenCalledWith('Test-chart.png', expect.any(Blob))
    );
    expect(svgToPngBlob.mock.calls[0][0].tagName.toLowerCase()).toBe('svg');
  });
});
