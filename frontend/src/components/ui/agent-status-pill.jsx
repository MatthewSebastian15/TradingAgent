import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';

import { cn } from '@/lib/utils';

const STATE_META = {
  pending: {
    Icon: Clock3,
    className: 'border-neutral-600/70 bg-neutral-500/10 text-neutral-400',
  },
  running: {
    Icon: Loader2,
    className: 'border-primary/70 bg-primary/15 text-primary',
    iconClassName: 'animate-spin',
  },
  done: {
    Icon: CheckCircle2,
    className: 'border-green-500/70 bg-green-500/15 text-green-400',
  },
  error: {
    Icon: AlertTriangle,
    className: 'border-red-500/70 bg-red-500/15 text-red-400',
  },
};

function normalizeStatus(status) {
  const normalized = String(status || 'pending')
    .trim()
    .toLowerCase();
  if (['running', 'started', 'start', 'in_progress', 'live'].includes(normalized)) return 'running';
  if (['done', 'completed', 'complete', 'success', 'finished'].includes(normalized)) return 'done';
  if (['error', 'failed', 'fail'].includes(normalized)) return 'error';
  return 'pending';
}

export function AgentStatusPill({ agentName, status = 'pending', elapsedTime, className }) {
  const normalizedStatus = normalizeStatus(status);
  const meta = STATE_META[normalizedStatus];
  const Icon = meta.Icon;

  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-colors duration-200',
        meta.className,
        className
      )}
    >
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', meta.iconClassName)} aria-hidden="true" />
      <span className="truncate font-sans">{agentName}</span>
      <span className="font-mono uppercase">{normalizedStatus}</span>
      {elapsedTime && <span className="font-mono text-muted-foreground">{elapsedTime}</span>}
    </span>
  );
}

AgentStatusPill.propTypes = {
  agentName: PropTypes.string.isRequired,
  className: PropTypes.string,
  elapsedTime: PropTypes.string,
  status: PropTypes.string,
};
