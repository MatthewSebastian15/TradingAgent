import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Heatmap } from './Heatmap';

const baseProps = {
  caption: 'Correlation',
  rowLabels: ['A', 'B'],
  colLabels: ['A', 'B'],
  values: [
    [1, -0.5],
    [-0.5, null],
  ],
  formatValue: (v) => (v == null ? '—' : v.toFixed(2)),
};

describe('Heatmap', () => {
  afterEach(() => cleanup());

  it('renders formatted cells with diverging colors and handles clicks', () => {
    const onCellClick = vi.fn();
    render(<Heatmap {...baseProps} highlight={{ row: 0, col: 1 }} onCellClick={onCellClick} />);
    expect(screen.getByText('Correlation')).toBeTruthy();
    const negative = screen.getAllByText('-0.50')[0].closest('td');
    expect(negative.style.backgroundColor).toContain('59, 130, 246');
    expect(screen.getByText('—').closest('td').style.backgroundColor).toBe('transparent');
    fireEvent.click(screen.getAllByText('-0.50')[0]);
    expect(onCellClick).toHaveBeenCalledWith(0, 1);
  });

  it('marks the highlighted cell with aria-current and an outline, and no other cell', () => {
    render(<Heatmap {...baseProps} highlight={{ row: 0, col: 1 }} />);
    const highlighted = screen.getAllByText('-0.50')[0].closest('td');
    expect(highlighted.getAttribute('aria-current')).toBe('true');
    expect(highlighted.className).toContain('outline-bloomberg-orange');
    const other = screen.getByText('1.00').closest('td');
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(other.className).not.toContain('outline-bloomberg-orange');
  });

  it('renders clickable cells as focusable buttons with a visible focus ring', () => {
    const onCellClick = vi.fn();
    render(<Heatmap {...baseProps} onCellClick={onCellClick} />);
    const buttons = screen.getAllByRole('button');
    // Three finite cells; the null cell is not interactive.
    expect(buttons).toHaveLength(3);
    expect(buttons[0].className).toContain('focus-visible:outline');
    fireEvent.click(screen.getByText('1.00'));
    expect(onCellClick).toHaveBeenCalledWith(0, 0);
  });

  it('renders no buttons when onCellClick is absent', () => {
    render(<Heatmap {...baseProps} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('does not call colorFor or textColorFor for null or non-finite cells', () => {
    const colorFor = vi.fn(() => 'rgb(1, 2, 3)');
    const textColorFor = vi.fn(() => 'rgb(4, 5, 6)');
    render(
      <Heatmap
        {...baseProps}
        values={[
          [Number.NaN, null],
          [undefined, 0.3],
        ]}
        colorFor={colorFor}
        textColorFor={textColorFor}
      />
    );
    expect(colorFor).toHaveBeenCalledTimes(1);
    expect(colorFor).toHaveBeenCalledWith(0.3);
    expect(textColorFor).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText('—')[0].closest('td').style.backgroundColor).toBe('transparent');
  });

  it('scopes row and column headers', () => {
    render(<Heatmap {...baseProps} rowHeader="Asset" />);
    const cols = screen.getAllByRole('columnheader');
    expect(cols.map((c) => c.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    const rows = screen.getAllByRole('rowheader');
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r.getAttribute('scope')).toBe('row'));
    expect(screen.getByText('Asset')).toBeTruthy();
  });

  it('tolerates duplicate labels and missing value rows', () => {
    render(<Heatmap {...baseProps} rowLabels={['A', 'A']} colLabels={['A', 'A']} values={[[1]]} />);
    expect(screen.getAllByRole('rowheader')).toHaveLength(2);
    expect(screen.getAllByText('—')).toHaveLength(3);
  });
});
