import React, { useState, useEffect, useRef } from 'react';

import { AGENT_ALIASES, PIPELINE, PIPELINE_IDS, PIPELINE_STATUSES } from '../domain/analysisContract';

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

export default function AgentLog({ status, agentProgress }) {
  const [elapsed, setElapsed] = useState(0);
  const [activeIds, setActiveIds] = useState(new Set());
  const [doneIds, setDoneIds] = useState(new Set());
  const [log, setLog] = useState([]);
  const logRef = useRef(null);
  const elapsedRef = useRef(0);
  const eventSeqRef = useRef(0);
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
      eventSeqRef.current = 0;
      lastEventSignatureRef.current = '';
      setElapsed(0);
      setActiveIds(new Set());
      setDoneIds(new Set());
      setLog([]);
      return;
    }

    if (!agentProgress?.agent_id) return;

    const agentId = normalizeAgentId(agentProgress.agent_id);
    const agentName = agentProgress.agent_name || agentId;
    const eventStatus = normalizeStatus(agentProgress.status);
    const statusMessage = agentProgress.status_message || '';
    const isPipelineAgent = PIPELINE_IDS.has(agentId);
    const eventSignature = [agentId, eventStatus, statusMessage].join('|');
    if (eventSignature === lastEventSignatureRef.current) return;
    lastEventSignatureRef.current = eventSignature;

    setActiveIds((prev) => {
      const next = new Set(prev);
      if (isPipelineAgent && eventStatus === PIPELINE_STATUSES.STARTED) next.add(agentId);
      if (isPipelineAgent && (eventStatus === PIPELINE_STATUSES.COMPLETED || eventStatus === PIPELINE_STATUSES.FAILED))
        next.delete(agentId);
      return next;
    });

    setDoneIds((prev) => {
      const next = new Set(prev);
      if (isPipelineAgent && eventStatus === PIPELINE_STATUSES.COMPLETED) next.add(agentId);
      return next;
    });

    setLog((prev) =>
      [
        {
          id: `${agentId}-${(eventSeqRef.current += 1)}`,
          ts: formatTime(elapsedRef.current),
          agent: agentName,
          status: eventStatus,
          msg: statusMessage,
        },
        ...prev,
      ].slice(0, 30)
    );
  }, [agentProgress]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [log]);

  const doneCount = Math.min(doneIds.size, PIPELINE.length);
  const totalSteps = PIPELINE.length;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">
      <div className="flex items-center justify-between px-4 py-2 border-b border-bloomberg-border bg-black">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bloomberg-orange animate-pulse-dot" />
            <span className="font-mono text-xs font-semibold text-bloomberg-orange tracking-wider">
              PIPELINE ACTIVE
            </span>
          </span>
          <span className="font-mono text-xs text-bloomberg-muted">SSE STREAM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-bloomberg-white">
            {doneCount}/{totalSteps} AGENTS
          </span>
          <span className="font-mono text-xs text-bloomberg-orange">{formatTime(elapsed)}</span>
        </div>
      </div>

      <div className="h-0.5 bg-bloomberg-surface">
        <div
          className="h-full bg-bloomberg-orange transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex divide-x divide-bloomberg-border">
        <div className="flex-1 p-3">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-3">
            Agent Pipeline
          </div>
          <div className="flex flex-col gap-1">
            {PIPELINE.map((step) => {
              const done = doneIds.has(step.id);
              const active = activeIds.has(step.id);
              return (
                <div
                  key={step.id}
                  className={`flex items-center gap-2.5 px-2 py-1.5 transition-colors duration-200 ${active ? 'bg-bloomberg-surface' : ''}`}
                >
                  <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                    {done ? (
                      <span className="font-mono text-xs text-bloomberg-green">✓</span>
                    ) : active ? (
                      <div
                        className="w-3 h-3 border border-t-transparent rounded-full animate-spin"
                        style={{ borderColor: step.color, borderTopColor: 'transparent' }}
                      />
                    ) : (
                      <span className="font-mono text-xs text-bloomberg-border">○</span>
                    )}
                  </div>

                  <div
                    className="w-0.5 h-4 flex-shrink-0 transition-opacity duration-200"
                    style={{ background: step.color, opacity: done || active ? 1 : 0.2 }}
                  />

                  <span
                    className="font-mono text-xs tracking-wider flex-1 transition-colors duration-200"
                    style={{ color: done ? '#525252' : active ? '#e5e5e5' : '#3d3d3d' }}
                  >
                    {step.label}
                  </span>

                  {done && <span className="font-mono text-xs text-bloomberg-green">DONE</span>}
                  {active && (
                    <span
                      className="font-mono text-xs animate-pulse-dot"
                      style={{ color: step.color }}
                    >
                      LIVE
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="w-48 flex flex-col">
          <div className="px-3 py-3 border-b border-bloomberg-border">
            <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
              Event Log
            </div>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 340 }}>
            {log.length === 0 ? (
              <div className="font-mono text-xs text-bloomberg-border p-1">Awaiting events...</div>
            ) : (
              <div className="flex flex-col gap-1">
                {log.map((ev) => (
                  <div key={ev.id} className="border-l-2 border-bloomberg-border pl-2 py-0.5">
                    <div className="font-mono text-xs text-bloomberg-muted">{ev.ts}</div>
                    <div className="font-mono text-xs text-bloomberg-white truncate">
                      {ev.agent}
                    </div>
                    <div
                      className={`font-mono text-xs ${ev.status === PIPELINE_STATUSES.COMPLETED ? 'text-bloomberg-green' : ev.status === PIPELINE_STATUSES.FAILED ? 'text-bloomberg-red' : 'text-bloomberg-orange'}`}
                    >
                      {(ev.status || '').toUpperCase()}
                    </div>
                    {ev.msg && (
                      <div className="font-mono text-xs text-bloomberg-muted truncate">
                        {ev.msg}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-bloomberg-border px-3 py-2">
            <div className="font-mono text-xs text-bloomberg-muted leading-relaxed line-clamp-3">
              {status || 'Waiting for pipeline...'}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-bloomberg-border px-4 py-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot" />
        <span className="font-mono text-xs text-bloomberg-muted tracking-wider">
          PROGRESS: {pct}% - {doneCount} of {totalSteps} agents complete
        </span>
      </div>
    </div>
  );
}
