import { Download } from 'lucide-react';
import PropTypes from 'prop-types';

import { downloadText, exportFilename, toCsv } from '../exporters';
import { divergingColor, textOnDiverging } from './chartTheme';

export function Heatmap({
  caption,
  rowHeader = '',
  rowLabels,
  colLabels,
  values,
  formatValue,
  colorFor = divergingColor,
  textColorFor = textOnDiverging,
  highlight,
  onCellClick,
  exportName,
}) {
  const csvName = exportName === null ? null : exportName || caption;
  const handleCsv = () => {
    const columns = [
      { key: 'label', label: rowHeader || '' },
      ...colLabels.map((label, j) => ({
        key: `c${j}`,
        label,
        csv: (row) => formatValue(row.values[j] ?? null),
      })),
    ];
    const rows = rowLabels.map((label, i) => ({ label, values: values[i] || [] }));
    downloadText(`${exportFilename(csvName)}.csv`, toCsv(columns, rows));
  };
  return (
    <div className="min-w-0">
      {csvName && rowLabels.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            aria-label={`Download ${csvName} as CSV`}
            onClick={handleCsv}
            className="-mb-px inline-flex h-6 items-center gap-1 border border-b-0 border-bloomberg-border px-2 font-mono text-[10px] tracking-wider text-bloomberg-white/80 uppercase hover:text-bloomberg-orange focus-visible:outline focus-visible:outline-1 focus-visible:outline-bloomberg-orange"
          >
            <Download className="h-3 w-3" aria-hidden="true" />
            CSV
          </button>
        </div>
      )}
      <div className="overflow-auto rounded-none border border-bloomberg-border">
        <table className="w-full border-collapse font-mono text-[11px] tabular-nums">
          {caption && (
            <caption className="bg-black px-2 py-1.5 text-left text-xs tracking-wider text-bloomberg-orange uppercase">
              {caption}
            </caption>
          )}
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-10 bg-bloomberg-surface px-2 py-1.5 text-left text-[10px] font-normal tracking-wider text-bloomberg-white/80 uppercase"
              >
                {rowHeader}
              </th>
              {colLabels.map((label, j) => (
                <th
                  key={`${label}-${j}`}
                  scope="col"
                  className="bg-bloomberg-surface px-2 py-1.5 text-right text-[10px] font-normal tracking-wider whitespace-nowrap text-bloomberg-white/80 uppercase"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel, i) => (
              <tr key={`${rowLabel}-${i}`}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-black px-2 py-1.5 text-left font-normal whitespace-nowrap text-bloomberg-white/80 uppercase"
                >
                  {rowLabel}
                </th>
                {colLabels.map((colLabel, j) => {
                  const raw = values[i]?.[j];
                  const finite = Number.isFinite(raw);
                  const active = Boolean(highlight) && highlight.row === i && highlight.col === j;
                  const content = formatValue(finite ? raw : null);
                  // Null / non-finite cells stay transparent and never reach the color callbacks.
                  const style = finite
                    ? { backgroundColor: colorFor(raw), color: textColorFor(raw) }
                    : { backgroundColor: 'transparent' };
                  return (
                    <td
                      key={`${colLabel}-${j}`}
                      aria-current={active ? 'true' : undefined}
                      className={`rounded-none border border-bloomberg-border px-2 py-1.5 text-right whitespace-nowrap ${
                        finite ? '' : 'text-bloomberg-white/80'
                      } ${active ? 'outline outline-2 -outline-offset-2 outline-bloomberg-orange' : ''}`}
                      style={style}
                    >
                      {onCellClick && finite ? (
                        <button
                          type="button"
                          className="w-full text-right focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-bloomberg-orange"
                          onClick={() => onCellClick(i, j)}
                        >
                          {content}
                        </button>
                      ) : (
                        content
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

Heatmap.propTypes = {
  caption: PropTypes.string,
  exportName: PropTypes.string,
  rowHeader: PropTypes.string,
  rowLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
  colLabels: PropTypes.arrayOf(PropTypes.string).isRequired,
  values: PropTypes.arrayOf(PropTypes.arrayOf(PropTypes.number)).isRequired,
  formatValue: PropTypes.func.isRequired,
  colorFor: PropTypes.func,
  textColorFor: PropTypes.func,
  highlight: PropTypes.shape({ row: PropTypes.number, col: PropTypes.number }),
  onCellClick: PropTypes.func,
};
