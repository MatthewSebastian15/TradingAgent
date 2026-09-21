import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DataTable } from './DataTable';

const columns = [
  { key: 'name', label: 'Scenario' },
  { key: 'shock', label: 'Shock', align: 'right' },
];

describe('DataTable', () => {
  afterEach(() => cleanup());

  it('renders headers, custom cells and right-aligned numbers', () => {
    render(
      <DataTable
        caption="Stress"
        columns={[
          { key: 'name', label: 'Scenario' },
          {
            key: 'shock',
            label: 'Shock',
            align: 'right',
            render: (r) => `${r.shock}%`,
            className: (r) => (r.shock < 0 ? 'text-bloomberg-red' : 'text-bloomberg-white'),
          },
        ]}
        rows={[{ name: 'Crash', shock: -9 }]}
        rowKey={(r) => r.name}
      />
    );
    expect(screen.getByText('Scenario')).toBeTruthy();
    const cell = screen.getByText('-9%');
    expect(cell.className).toContain('text-right');
    expect(cell.className).toContain('text-bloomberg-red');
  });

  it('shows the empty message', () => {
    render(<DataTable columns={[{ key: 'a', label: 'A' }]} rows={[]} emptyMessage="Nothing." />);
    expect(screen.getByText('Nothing.')).toBeTruthy();
  });

  it('uses terminal styling: caption, sharp wrapper, scroll and max height, tabular numbers', () => {
    const { container } = render(
      <DataTable
        caption="Stress"
        columns={columns}
        rows={[{ name: 'Crash', shock: -9 }]}
        maxHeightClass="max-h-64"
      />
    );
    expect(screen.getByText('Stress').tagName).toBe('CAPTION');
    const wrapper = container.firstChild;
    expect(wrapper.className).toContain('overflow-auto');
    expect(wrapper.className).toContain('max-h-64');
    expect(wrapper.className).toContain('border-bloomberg-border');
    expect(wrapper.className).toContain('rounded-none');
    expect(container.querySelector('table').className).toContain('tabular-nums');
    expect(screen.getByText('-9').className).toContain('whitespace-nowrap');
    expect(screen.getByText('Crash').className).toContain('text-bloomberg-white');
  });

  it('right-aligns numeric headers and cells, left-aligns the rest', () => {
    render(<DataTable columns={columns} rows={[{ name: 'Crash', shock: -9 }]} />);
    expect(screen.getByText('Shock').className).toContain('text-right');
    expect(screen.getByText('Scenario').className).toContain('text-left');
    expect(screen.getByText('-9').className).toContain('text-right');
    expect(screen.getByText('Crash').className).toContain('text-left');
  });

  it('keeps headers sticky and scoped', () => {
    render(<DataTable columns={columns} rows={[]} />);
    screen.getAllByRole('columnheader').forEach((th) => {
      expect(th.getAttribute('scope')).toBe('col');
      expect(th.className).toContain('sticky');
      expect(th.className).toContain('top-0');
    });
  });

  it('sticks the first column only when asked', () => {
    const rows = [{ name: 'Crash', shock: -9 }];
    const { rerender } = render(<DataTable columns={columns} rows={rows} />);
    expect(screen.getByText('Crash').className).not.toContain('left-0');
    expect(screen.getByText('Scenario').className).not.toContain('left-0');
    rerender(<DataTable columns={columns} rows={rows} stickyFirstColumn />);
    expect(screen.getByText('Crash').className).toContain('sticky');
    expect(screen.getByText('Crash').className).toContain('left-0');
    expect(screen.getByText('Scenario').className).toContain('left-0');
    expect(screen.getByText('Shock').className).not.toContain('left-0');
  });

  it('renders one row per entry using rowKey without duplicate-key warnings', () => {
    const errors = [];
    const original = console.error;
    console.error = (...a) => errors.push(a.join(' '));
    try {
      render(
        <DataTable
          columns={columns}
          rows={[
            { name: 'A', shock: 1 },
            { name: 'B', shock: 2 },
          ]}
          rowKey={(r) => r.name}
        />
      );
    } finally {
      console.error = original;
    }
    expect(screen.getAllByRole('row')).toHaveLength(3);
    expect(errors.filter((e) => e.includes('key'))).toHaveLength(0);
  });

  it('spans the empty message across all columns', () => {
    render(<DataTable columns={columns} rows={[]} />);
    const cell = screen.getByText('No rows.');
    expect(cell.getAttribute('colspan')).toBe('2');
  });
});
