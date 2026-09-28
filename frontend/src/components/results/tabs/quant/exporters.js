const SVG_NS = 'http://www.w3.org/2000/svg';

// CSV cell: RFC 4180 quoting plus a guard against spreadsheet formula injection.
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+@\t\r]/.test(text) || /^-[^\d.]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function cellValue(column, row) {
  if (column.csv) return column.csv(row);
  if (column.render) {
    const rendered = column.render(row);
    if (typeof rendered === 'string' || typeof rendered === 'number') return rendered;
  }
  return row[column.key];
}

export function toCsv(columns, rows) {
  const header = columns.map((c) => csvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvCell(cellValue(c, row))).join(','));
  return [header, ...body].join('\r\n');
}

export function exportFilename(...parts) {
  return parts
    .filter(Boolean)
    .map((p) =>
      String(p)
        .trim()
        .replace(/[^A-Za-z0-9.]+/g, '-')
        .replace(/^-+|-+$/g, '')
    )
    .filter(Boolean)
    .join('_');
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function downloadText(filename, text, mime = 'text/csv') {
  // BOM so Excel opens UTF-8 (IDR, arrows, sigma) correctly.
  downloadBlob(filename, new Blob(['﻿', text], { type: `${mime};charset=utf-8` }));
}

// Standalone SVG string: chart colors are attributes already; add namespace, font and a
// solid background because the page background is not part of the SVG.
export function serializeSvg(svg, { background = '#000000' } = {}) {
  const clone = svg.cloneNode(true);
  clone.setAttribute('xmlns', SVG_NS);
  clone.setAttribute('font-family', "'IBM Plex Mono', Consolas, monospace");
  const rect = document.createElementNS(SVG_NS, 'rect');
  rect.setAttribute('width', '100%');
  rect.setAttribute('height', '100%');
  rect.setAttribute('fill', background);
  clone.insertBefore(rect, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export function svgToPngBlob(svg, scale = 2) {
  const width = Number(svg.getAttribute('width')) || svg.clientWidth;
  const height = Number(svg.getAttribute('height')) || svg.clientHeight;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serializeSvg(svg))}`;
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas is not available.'));
      ctx.scale(scale, scale);
      ctx.drawImage(image, 0, 0, width, height);
      return canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed.'))),
        'image/png'
      );
    };
    image.onerror = () => reject(new Error('Chart image could not be rendered.'));
    image.src = url;
  });
}
