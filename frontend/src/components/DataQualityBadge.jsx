import PropTypes from 'prop-types';

import DataStatusBadge from './DataStatusBadge';

export default function DataQualityBadge({ quality, label = 'Data quality' }) {
  if (!quality || typeof quality !== 'object') return null;
  return (
    <div className="border border-bloomberg-border bg-black px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
        {label}
      </div>
      <DataStatusBadge quality={quality} />
    </div>
  );
}

DataQualityBadge.propTypes = {
  quality: PropTypes.object,
  label: PropTypes.string,
};
