import PropTypes from 'prop-types';

import { formatSourceLabel, normalizeSources } from '../utils/dataStatus';

export default function DataSourceBadge({ sources, label = 'Sources' }) {
  const normalized = normalizeSources(sources);
  if (!normalized.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 font-mono text-[11px] text-bloomberg-muted">
      <span className="border border-bloomberg-border bg-black px-2 py-0.5 uppercase tracking-wider">
        {label}
      </span>
      {normalized.map((source) => (
        <span
          key={source}
          className="border border-bloomberg-border bg-bloomberg-surface px-2 py-0.5"
        >
          {formatSourceLabel(source)}
        </span>
      ))}
    </div>
  );
}

DataSourceBadge.propTypes = {
  sources: PropTypes.oneOfType([PropTypes.array, PropTypes.object, PropTypes.string]),
  label: PropTypes.string,
};
