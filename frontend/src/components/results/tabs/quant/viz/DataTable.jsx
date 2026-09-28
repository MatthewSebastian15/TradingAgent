import { Download } from 'lucide-react';
import PropTypes from 'prop-types';

import { downloadText, exportFilename, toCsv } from '../exporters';

export function DataTable({
  caption,
  columns,
  rows,
  rowKey,
  stickyFirstColumn = false,
  emptyMessage = 'No rows.',
  maxHeightClass = '',
  exportName,
}) {
  const align = (col) => (col.align === 'right' ? 'text-right' : 'text-left');
  const csvName = exportName === null ? null : exportName || caption;
  return (
    <div className="min-w-0">
      {csvName && rows.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={`Download ${csvName} as CSV`}
            onClick={() => downloadText(`${exportFilename(csvName)}.csv`, toCsv(columns, rows))}
            className="-mb-px inline-flex h-6 items-center gap-1 border border-b-0 border-bloomberg-border px-2 font-mono text-[10px] tracking-wider text-bloomberg-white/80 uppercase hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            CSV
          </button>
        </div>
      )}
      <div
        className={`overflow-auto rounded-none border border-bloomberg-border ${maxHeightClass}`}
      >
        <table className="w-full border-collapse font-mono text-xs tabular-nums">
          {caption && (
            <caption className="bg-black px-2 py-1.5 text-left text-xs tracking-wider text-bloomberg-orange uppercase">
              {caption}
            </caption>
          )}
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th
                  key={col.key}
                  scope="col"
                  className={`sticky top-0 border-b border-bloomberg-border bg-bloomberg-surface px-2 py-1.5 text-[10px] font-normal tracking-wider whitespace-nowrap text-bloomberg-white/80 uppercase ${align(col)} ${
                    stickyFirstColumn && i === 0 ? 'left-0 z-20' : 'z-10'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-2 py-3 text-center text-bloomberg-white/80"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row, r) => (
                <tr
                  key={rowKey ? rowKey(row, r) : r}
                  className="border-b border-bloomberg-border last:border-b-0 hover:bg-bloomberg-surface"
                >
                  {columns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`px-2 py-1.5 whitespace-nowrap ${align(col)} ${
                        (col.className && col.className(row)) || 'text-bloomberg-white'
                      } ${stickyFirstColumn && i === 0 ? 'sticky left-0 z-10 bg-black' : ''}`}
                    >
                      {col.render ? col.render(row) : row[col.key]}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

DataTable.propTypes = {
  caption: PropTypes.string,
  exportName: PropTypes.string,
  columns: PropTypes.arrayOf(
    PropTypes.shape({
      key: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired,
      align: PropTypes.oneOf(['left', 'right']),
      render: PropTypes.func,
      className: PropTypes.func,
    })
  ).isRequired,
  rows: PropTypes.arrayOf(PropTypes.object).isRequired,
  rowKey: PropTypes.func,
  stickyFirstColumn: PropTypes.bool,
  emptyMessage: PropTypes.string,
  maxHeightClass: PropTypes.string,
};
