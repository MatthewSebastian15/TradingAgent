import React, { useEffect, useRef, useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentStatusPill } from '@/components/ui/agent-status-pill';
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
    <Card className="animate-in fade-in slide-in-from-top-2 rounded-md border-border bg-card">
      <CardHeader className="border-b border-border p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm uppercase tracking-widest text-primary">
              Pipeline active
            </CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">SSE stream</div>
          </div>
          <div className="flex items-center gap-3 font-mono text-xs">
            <span className="text-foreground">
              {doneCount}/{totalSteps} agents
            </span>
            <span className="text-primary">{formatTime(elapsed)}</span>
          </div>
        </div>
      </CardHeader>

      <div className="h-1 bg-muted">
        <div className="h-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <CardContent className="p-4">
        <ScrollArea className="h-96 pr-4">
          <ol className="relative space-y-3 border-l border-border pl-4">
            {PIPELINE.map((step) => {
              const done = doneIds.has(step.id);
              const active = activeIds.has(step.id);
              const error = errorIds.has(step.id);
              const statusValue = pillStatus({ done, active, error });
              const elapsedTime = agentTimes[step.id] || (active ? formatTime(elapsed) : undefined);

              return (
                <li key={step.id} className="animate-in fade-in duration-300">
                  <span
                    className={`absolute -left-1.5 mt-3 h-3 w-3 rounded-full border border-background transition-colors ${
                      active
                        ? 'bg-primary'
                        : done
                          ? 'bg-green-500'
                          : error
                            ? 'bg-red-500'
                            : 'bg-neutral-600'
                    }`}
                  />
                  <AgentStatusPill
                    agentName={titleCase(step.label)}
                    status={statusValue}
                    elapsedTime={elapsedTime}
                    className="w-full justify-start"
                  />
                </li>
              );
            })}
          </ol>
        </ScrollArea>

        <div className="mt-4 rounded-md border border-border bg-black px-3 py-2">
          <div className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
            {status || 'Waiting for pipeline...'}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          <span>
            Progress: {pct}% - {doneCount} of {totalSteps} agents complete
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
