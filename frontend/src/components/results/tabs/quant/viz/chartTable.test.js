import { describe, expect, it } from 'vitest';

import { binsTable, pointsTable, seriesTable } from './chartTable';

describe('chart tables', () => {
  it('merges visible series by x and skips hidden ones', () => {
    const table = seriesTable(
      [
        {
          id: 'a',
          label: 'Strategy',
          pts: [
            { x: 2, y: 1.5 },
            { x: 1, y: 1 },
          ],
        },
        { id: 'b', label: 'Hold', pts: [{ x: 1, y: 0.9 }] },
        { id: 'p', hideInLegend: true, pts: [{ x: 1, y: 9 }] },
      ],
      { formatX: (x) => `d${x}`, formatY: (y) => y.toFixed(1) }
    );
    expect(table.columns.map((c) => c.label)).toEqual(['Date', 'Strategy', 'Hold']);
    expect(table.rows.map((r) => table.columns.map((c) => c.render(r)))).toEqual([
      ['d1', '1.0', '0.9'],
      ['d2', '1.5', ''],
    ]);
    expect(
      seriesTable([{ id: 'p', hideInLegend: true, pts: [{ x: 1, y: 1 }] }], {
        formatX: String,
        formatY: String,
      })
    ).toBeNull();
  });

  it('describes histogram bins and scatter points', () => {
    const bins = binsTable([{ binStart: -1, binEnd: 0, count: 3 }], {
      formatX: (v) => `${v}%`,
      countLabel: 'Days',
    });
    expect(bins.columns.map((c) => c.label)).toEqual(['From', 'To', 'Days']);
    expect(bins.columns[0].render(bins.rows[0])).toBe('-1%');

    const pts = pointsTable([{ x: 20, y: 9, label: 'AAPL' }], {
      formatX: String,
      formatY: String,
      xLabel: 'Vol',
      yLabel: 'Return',
    });
    expect(pts.columns.map((c) => c.label)).toEqual(['Point', 'Vol', 'Return']);
  });
});
