import PropTypes from 'prop-types';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

import { signalBadgeVariants } from './signalBadgeVariants';

function normalizeSignal(signal) {
  const normalized = String(signal || 'HOLD')
    .trim()
    .toUpperCase();
  return ['BUY', 'WAIT', 'HOLD', 'REDUCE', 'SELL'].includes(normalized) ? normalized : 'HOLD';
}

function normalizeConfidence(confidence) {
  const numeric = Number(confidence);
  if (!Number.isFinite(numeric)) return null;
  return Math.max(0, Math.min(100, numeric <= 1 ? Math.round(numeric * 100) : Math.round(numeric)));
}

export function SignalBadge({ signal, confidence, className }) {
  const normalizedSignal = normalizeSignal(signal);
  const confidencePercent = normalizeConfidence(confidence);

  return (
    <Badge className={cn(signalBadgeVariants({ signal: normalizedSignal }), className)}>
      <span>{normalizedSignal}</span>
      {confidencePercent !== null && (
        <span className="rounded-sm bg-black/30 px-1.5 py-0.5 text-xs leading-none">
          {confidencePercent}%
        </span>
      )}
    </Badge>
  );
}

SignalBadge.propTypes = {
  className: PropTypes.string,
  confidence: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  signal: PropTypes.string,
};
