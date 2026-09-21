import PropTypes from 'prop-types';

export function DataTable({
  caption,
  columns,
  rows,
  rowKey,
  stickyFirstColumn = false,
  emptyMessage = 'No rows.',
  maxHeightClass = '',
}) {
  const align = (col) => (col.align === 'right' ? 'text-right' : 'text-left');
  return (
    <div className={`overflow-auto rounded-none border border-bloomberg-border ${maxHeightClass}`}>
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
                      col.className ? col.className(row) : 'text-bloomberg-white'
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
  );
}

DataTable.propTypes = {
  caption: PropTypes.string,
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
