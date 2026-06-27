import { AlertTriangle, CheckCircle2, Clock3, Loader2 } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useRef, useState } from 'react';

import {
  AGENT_ALIASES,
  PIPELINE,
  PIPELINE_IDS,
  PIPELINE_STATUSES,
} from '../domain/analysisContract';

function normalizeAgentId(id = '') {
  const normalized = String(id)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return AGENT_ALIASES[normalized] || normalized;
}

function normalizeStatus(status = '') {
  const normalized = String(status).trim().toLowerCase();
  if (['start', PIPELINE_STATUSES.RUNNING, 'in_progress'].includes(normalized)) {
    return PIPELINE_STATUSES.STARTED;
  }
  if (['done', 'complete', 'success', 'finished'].includes(normalized)) {
    return PIPELINE_STATUSES.COMPLETED;
  }
  if ([PIPELINE_STATUSES.ERROR, PIPELINE_STATUSES.FAILED, 'fail'].includes(normalized)) {
    return PIPELINE_STATUSES.FAILED;
  }
  return normalized || PIPELINE_STATUSES.STARTED;
}

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (char) => char.toUpperCase());
}

function pillStatus({ done, active, error }) {
  if (error) return 'error';
  if (done) return 'done';
  if (active) return 'running';
  return 'pending';
}

const STATUS_UI = {
  pending: {
    Icon: Clock3,
    row: 'border-bloomberg-border bg-black/40 text-bloomberg-muted',
    dot: 'bg-bloomberg-subtle',
  },
  running: {
    Icon: Loader2,
    row: 'border-bloomberg-orange bg-bloomberg-orange-dim text-bloomberg-orange',
    dot: 'bg-bloomberg-orange',
    icon: 'animate-spin',
  },
  done: {
    Icon: CheckCircle2,
    row: 'border-bloomberg-green bg-bloomberg-green-dim text-bloomberg-green',
    dot: 'bg-bloomberg-green',
  },
  error: {
    Icon: AlertTriangle,
    row: 'border-bloomberg-red bg-bloomberg-red-dim text-bloomberg-red',
    dot: 'bg-bloomberg-red',
  },
};

// Leaf that owns the 1s interval so the per-second tick re-renders only the
// time text, not the whole AgentLog tree. Reads wall-clock elapsed from a
// shared startMs, so multiple instances (header + active row) always agree and
// never drift like independent setInterval counters would.
function LiveTime({ startMs, running }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const tick = () => setSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
    tick();
    if (!running) return undefined;
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [running, startMs]);
  return formatTime(seconds);
}

LiveTime.propTypes = {
  startMs: PropTypes.number.isRequired,
  running: PropTypes.bool,
};

export default function AgentLog({ status, agentProgress }) {
  const [activeIds, setActiveIds] = useState(new Set());
  const [doneIds, setDoneIds] = useState(new Set());
  const [errorIds, setErrorIds] = useState(new Set());
  const [agentTimes, setAgentTimes] = useState({});
  const [startMs, setStartMs] = useState(() => Date.now());
  const lastEventSignatureRef = useRef('');

  useEffect(() => {
    if (agentProgress === null) {
      lastEventSignatureRef.current = '';
      setStartMs(Date.now());
      setActiveIds(new Set());
      setDoneIds(new Set());
      setErrorIds(new Set());
      setAgentTimes({});
      return;
    }

    if (!agentProgress?.agent_id) return;

    const agentId = normalizeAgentId(agentProgress.agent_id);
    const eventStatus = normalizeStatus(agentProgress.status);
    const statusMessage = agentProgress.status_message || '';
    const isPipelineAgent = PIPELINE_IDS.has(agentId);
    const eventSignature = [agentId, eventStatus, statusMessage].join('|');
    if (eventSignature === lastEventSignatureRef.current) return;
    lastEventSignatureRef.current = eventSignature;

    setActiveIds((prev) => {
      const next = new Set(prev);
      if (isPipelineAgent && eventStatus === PIPELINE_STATUSES.STARTED) next.add(agentId);
      if (
        isPipelineAgent &&
        (eventStatus === PIPELINE_STATUSES.COMPLETED || eventStatus === PIPELINE_STATUSES.FAILED)
      ) {
        next.delete(agentId);
      }
      return next;
    });

    setDoneIds((prev) => {
      const next = new Set(prev);
      if (isPipelineAgent && eventStatus === PIPELINE_STATUSES.COMPLETED) next.add(agentId);
      return next;
    });

    setErrorIds((prev) => {
      const next = new Set(prev);
      if (isPipelineAgent && eventStatus === PIPELINE_STATUSES.FAILED) next.add(agentId);
      return next;
    });

    if (
      isPipelineAgent &&
      (eventStatus === PIPELINE_STATUSES.COMPLETED || eventStatus === PIPELINE_STATUSES.FAILED)
    ) {
      setAgentTimes((prev) => ({
        ...prev,
        [agentId]: formatTime(Math.max(0, Math.floor((Date.now() - startMs) / 1000))),
      }));
    }
  }, [agentProgress, startMs]);

  const doneCount = Math.min(doneIds.size, PIPELINE.length);
  const totalSteps = PIPELINE.length;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <section className="animate-in fade-in slide-in-from-top-2 rounded-md border border-bloomberg-border bg-bloomberg-card">
      <div className="border-b border-bloomberg-border p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-mono text-xs font-semibold uppercase tracking-widest text-bloomberg-orange">
              Pipeline active
            </h3>
            <div className="mt-0.5 font-mono text-[11px] text-bloomberg-muted">SSE stream</div>
          </div>
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <span className="text-bloomberg-muted">
              <span className="text-bloomberg-white">{doneCount}</span>/{totalSteps} agents
            </span>
            <span className="tabular-nums text-bloomberg-orange">
              <LiveTime startMs={startMs} running={pct !== 100} />
            </span>
            {pct === 100 && (
              <span className="text-[10px] uppercase tracking-wider text-bloomberg-green">
                ✓ DONE
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="h-px bg-bloomberg-border">
        <div
          className={`h-full transition-all duration-500 ${pct === 100 ? 'bg-bloomberg-green' : 'bg-bloomberg-orange'}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="p-3">
        <ol className="relative space-y-1.5 border-l border-bloomberg-border pl-3">
          {PIPELINE.map((step, index) => {
            const done = doneIds.has(step.id);
            const active = activeIds.has(step.id);
            const error = errorIds.has(step.id);
            const statusValue = pillStatus({ done, active, error });
            const elapsedTime =
              agentTimes[step.id] ||
              (active ? <LiveTime startMs={startMs} running /> : undefined);
            const meta = STATUS_UI[statusValue];
            const Icon = meta.Icon;
            const useCustomColor = (done || active) && step.color && !error;

            return (
              <li key={step.id} className="animate-in fade-in duration-300">
                <span
                  className={`absolute -left-1 mt-2.5 h-2.5 w-2.5 rounded-full border border-bloomberg-card transition-colors${useCustomColor ? '' : ` ${meta.dot}`}`}
                  style={useCustomColor ? { backgroundColor: step.color } : undefined}
                />
                <div
                  className={`grid min-h-[28px] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border px-2.5 py-1 font-mono text-[11px] transition-colors ${meta.row}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 flex-shrink-0 text-right font-mono text-[9px] tabular-nums text-bloomberg-muted">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <Icon
                      className={`h-3 w-3 flex-shrink-0 ${meta.icon || ''}`}
                      aria-hidden="true"
                    />
                  </div>
                  <span className="truncate">{titleCase(step.label)}</span>
                  <span className="text-[10px] uppercase tracking-wider">{statusValue}</span>
                  {elapsedTime ? (
                    <span className="text-[10px] tabular-nums text-bloomberg-muted">
                      {elapsedTime}
                    </span>
                  ) : (
                    <span className="w-8" />
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="mt-3 flex items-start gap-2 border border-bloomberg-border bg-black px-2.5 py-1.5">
          <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bloomberg-orange" />
          <div className="line-clamp-3 font-mono text-[10px] leading-relaxed text-bloomberg-muted">
            {status || 'Waiting for pipeline...'}
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-bloomberg-muted">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 flex-shrink-0 animate-pulse rounded-full bg-bloomberg-orange" />
            <span>
              {doneCount} of {totalSteps} agents complete
            </span>
          </div>
          <span className={pct === 100 ? 'text-bloomberg-green' : 'text-bloomberg-orange'}>
            {pct}%
          </span>
        </div>
      </div>
    </section>
  );
}

AgentLog.propTypes = {
  agentProgress: PropTypes.shape({
    agent_id: PropTypes.string,
    status: PropTypes.string,
    status_message: PropTypes.string,
  }),
  status: PropTypes.string,
};
