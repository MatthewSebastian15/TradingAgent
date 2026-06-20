import PropTypes from 'prop-types';

import { Badge } from '@/components/ui/badge';

function labelForStatus(status) {
  const text = String(status || '').replace(/_/g, ' ');
  return text ? text.toUpperCase() : 'UNKNOWN';
}

function variantClass(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'success') return 'border-emerald-500/60 bg-emerald-500/10 text-emerald-300';
  if (normalized === 'skipped_sufficient_primary') return 'border-blue-500/60 bg-blue-500/10 text-blue-300';
  if (normalized === 'missing_api_key' || normalized === 'disabled') return 'border-amber-500/60 bg-amber-500/10 text-amber-300';
  return 'border-red-500/60 bg-red-500/10 text-red-300';
}

export default function TickerNewsQualityBadge({ provider, status }) {
  return (
    <Badge variant="outline" className={`rounded-md font-mono text-xs ${variantClass(status)}`}>
      {provider}: {labelForStatus(status)}
    </Badge>
  );
}

TickerNewsQualityBadge.propTypes = {
  provider: PropTypes.string.isRequired,
  status: PropTypes.string,
};
