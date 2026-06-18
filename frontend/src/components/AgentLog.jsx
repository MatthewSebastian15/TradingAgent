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

export default function AgentLog({ status, agentProgress }) {
  const [elapsed, setElapsed] = useState(0);
  const [activeIds, setActiveIds] = useState(new Set());
  const [doneIds, setDoneIds] = useState(new Set());
  const [errorIds, setErrorIds] = useState(new Set());
  const [agentTimes, setAgentTimes] = useState({});
  const elapsedRef = useRef(0);
  const lastEventSignatureRef = useRef('');

  useEffect(() => {
    const t = setInterval(() => {
      setElapsed((p) => {
        const next = p + 1;
        elapsedRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (agentProgress === null) {
      elapsedRef.current = 0;
      lastEventSignatureRef.current = '';
      setElapsed(0);
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
      setAgentTimes((prev) => ({ ...prev, [agentId]: formatTime(elapsedRef.current) }));
    }
  }, [agentProgress]);

  const doneCount = Math.min(doneIds.size, PIPELINE.length);
  const totalSteps = PIPELINE.length;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <section className="animate-in fade-in slide-in-from-top-2 rounded-md border border-bloomberg-border bg-bloomberg-card">
      <div className="border-b border-bloomberg-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-mono text-sm font-semibold uppercase tracking-widest text-bloomberg-orange">
              Pipeline active
            </h3>
            <div className="mt-1 font-mono text-xs text-bloomberg-muted">SSE stream</div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-bloomberg-white">
              {doneCount}/{totalSteps} agents
            </span>
            <span className="text-bloomberg-orange">{formatTime(elapsed)}</span>
          </div>
        </div>
      </div>

      <div className="h-px bg-bloomberg-border">
        <div
          className="h-full bg-bloomberg-orange transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="p-4">
        <div className="h-96 overflow-y-auto pr-2">
          <ol className="relative space-y-3 border-l border-bloomberg-border pl-4">
            {PIPELINE.map((step) => {
              const done = doneIds.has(step.id);
              const active = activeIds.has(step.id);
              const error = errorIds.has(step.id);
              const statusValue = pillStatus({ done, active, error });
              const elapsedTime = agentTimes[step.id] || (active ? formatTime(elapsed) : undefined);
              const meta = STATUS_UI[statusValue];
              const Icon = meta.Icon;

              return (
                <li key={step.id} className="animate-in fade-in duration-300">
                  <span
                    className={`absolute -left-1.5 mt-3 h-3 w-3 rounded-full border border-bloomberg-card transition-colors ${meta.dot}`}
                  />
                  <div
                    className={`grid min-h-[32px] grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 border px-3 py-2 font-mono text-xs transition-colors ${meta.row}`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${meta.icon || ''}`} aria-hidden="true" />
                    <span className="truncate text-bloomberg-white">{titleCase(step.label)}</span>
                    <span className="uppercase tracking-wider">{statusValue}</span>
                    {elapsedTime && <span className="text-bloomberg-muted">{elapsedTime}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="mt-4 border border-bloomberg-border bg-black px-3 py-2">
          <div className="line-clamp-3 font-mono text-xs leading-relaxed text-bloomberg-muted">
            {status || 'Waiting for pipeline...'}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 font-mono text-xs text-bloomberg-muted">
          <span className="h-2 w-2 rounded-full bg-bloomberg-orange animate-pulse" />
          <span>
            Progress: {pct}% - {doneCount} of {totalSteps} agents complete
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
