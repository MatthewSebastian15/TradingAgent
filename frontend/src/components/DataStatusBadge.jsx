import PropTypes from 'prop-types';

import { getDataStatusClasses, getDataStatusLabel, normalizeQualityPayload, readableSource } from '../utils/dataStatus';

function displayConfidence(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return String(value);
  const normalized = number <= 1 ? Math.round(number * 100) : Math.round(number);
  return `${normalized}`;
}

export default function DataStatusBadge({ quality, status, source, reason, confidenceScore, compact = false }) {
  const normalized = normalizeQualityPayload(quality) || {
    status: status || 'unknown',
    source: source || null,
    reason: reason || null,
    confidenceScore: confidenceScore ?? null,
    warnings: [],
  };
  const finalStatus = status || normalized.status;
  const finalSource = source || normalized.source;
  const finalReason = reason || normalized.reason;
  const finalScore = confidenceScore ?? normalized.confidenceScore;
  const confidence = displayConfidence(finalScore);
  const warnings = Array.isArray(normalized.warnings) ? normalized.warnings : [];

  return (
    <div className={`font-mono text-[11px] ${compact ? 'inline-flex flex-wrap gap-1.5' : 'flex flex-wrap gap-2'}`}>
      <span className={`inline-flex w-fit items-center rounded-sm border px-2 py-0.5 uppercase tracking-wider ${getDataStatusClasses(finalStatus, finalScore)}`}>
        {getDataStatusLabel(finalStatus)}
      </span>
      {finalSource && (
        <span className="inline-flex w-fit items-center rounded-sm border border-bloomberg-border bg-black px-2 py-0.5 text-bloomberg-muted">
          Source: {readableSource(finalSource)}
        </span>
      )}
      {confidence && (
        <span className="inline-flex w-fit items-center rounded-sm border border-bloomberg-border bg-black px-2 py-0.5 text-bloomberg-muted">
          Confidence: {confidence}
        </span>
      )}
      {finalReason && !compact && <span className="text-bloomberg-muted">Reason: {finalReason}</span>}
      {warnings.length > 0 && !compact && (
        <span className="text-bloomberg-amber">Warning: {warnings.join(' | ')}</span>
      )}
    </div>
  );
}

DataStatusBadge.propTypes = {
  quality: PropTypes.object,
  status: PropTypes.string,
  source: PropTypes.string,
  reason: PropTypes.string,
  confidenceScore: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  compact: PropTypes.bool,
};
