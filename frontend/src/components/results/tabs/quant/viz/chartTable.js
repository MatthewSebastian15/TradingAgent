// Tabular alternatives for charts ("View as table" and CSV).
export function seriesTable(lines, { formatX, formatY, xLabel = 'Date' }) {
  const visible = lines.filter((l) => !l.hideInLegend && l.pts.length > 0);
  if (visible.length === 0) return null;
  const byX = new Map();
  for (const line of visible) {
    for (const p of line.pts) {
      if (!byX.has(p.x)) byX.set(p.x, { x: p.x });
      byX.get(p.x)[line.id] = p.y;
    }
  }
  return {
    columns: [
      { key: 'x', label: xLabel, render: (r) => formatX(r.x) },
      ...visible.map((line) => ({
        key: line.id,
        label: line.label || line.id,
        align: 'right',
        render: (r) => (Number.isFinite(r[line.id]) ? formatY(r[line.id]) : ''),
      })),
    ],
    rows: [...byX.values()].sort((a, b) => a.x - b.x),
  };
}

export function binsTable(bins, { formatX, countLabel = 'Count' }) {
  if (bins.length === 0) return null;
  return {
    columns: [
      { key: 'binStart', label: 'From', align: 'right', render: (r) => formatX(r.binStart) },
      { key: 'binEnd', label: 'To', align: 'right', render: (r) => formatX(r.binEnd) },
      { key: 'count', label: countLabel, align: 'right', render: (r) => r.count },
    ],
    rows: bins,
  };
}

export function pointsTable(points, { formatX, formatY, xLabel = 'x', yLabel = 'y' }) {
  if (points.length === 0) return null;
  return {
    columns: [
      { key: 'label', label: 'Point', render: (r) => r.label || '' },
      { key: 'x', label: xLabel, align: 'right', render: (r) => formatX(r.x) },
      { key: 'y', label: yLabel, align: 'right', render: (r) => formatY(r.y) },
    ],
    rows: points,
  };
}
