import PropTypes from 'prop-types';
import { cva } from 'class-variance-authority';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const signalBadgeVariants = cva('gap-2 border font-mono text-xs uppercase tracking-wider', {
  variants: {
    signal: {
      BUY: 'border-green-500/60 bg-green-500/15 text-green-400',
      WAIT: 'border-yellow-500/60 bg-yellow-500/15 text-yellow-300',
      HOLD: 'border-neutral-500/60 bg-neutral-500/15 text-neutral-300',
      REDUCE: 'border-orange-500/60 bg-orange-500/15 text-orange-400',
      SELL: 'border-red-500/60 bg-red-500/15 text-red-400',
    },
  },
  defaultVariants: {
    signal: 'HOLD',
  },
});

function normalizeSignal(signal) {
  const normalized = String(signal || 'HOLD').trim().toUpperCase();
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

export { signalBadgeVariants };
