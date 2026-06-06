import PropTypes from 'prop-types';

import DataStatusBadge from './DataStatusBadge';
import { normalizeQualityPayload } from '../utils/dataStatus';

export default function DataQualityBadge({ quality, label = 'Data quality' }) {
  if (!quality || typeof quality !== 'object') return null;
  const normalized = normalizeQualityPayload(quality);
  const freshness = normalized?.freshnessStatus;
  const warnings = normalized?.warnings || [];
  return (
    <div className="border border-bloomberg-border bg-black px-3 py-2">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-bloomberg-muted">
        {label}
      </div>
      <DataStatusBadge quality={quality} />
      {freshness?.status && (
        <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
          Freshness: {freshness.status}
        </div>
      )}
      {normalized?.reason && (
        <div className="mt-1 font-mono text-[11px] text-bloomberg-muted">
          Reason: {normalized.reason}
        </div>
      )}
      {warnings.length > 0 && (
        <ul className="mt-1 flex flex-col gap-1 font-mono text-[11px] text-bloomberg-amber">
          {warnings.map((warning, index) => (
            <li key={`${warning}-${index}`}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

DataQualityBadge.propTypes = {
  quality: PropTypes.object,
  label: PropTypes.string,
};
