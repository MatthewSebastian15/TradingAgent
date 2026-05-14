import React, { useState, useEffect, useRef } from 'react';

const PIPELINE = [
  { id: 'data_collection',   label: 'DATA COLLECTION',      short: 'DATA',  color: '#525252' },
  { id: 'market_analyst',    label: 'MARKET ANALYST',        short: 'MKT',   color: '#06b6d4' },
  { id: 'news_analyst',      label: 'NEWS + SOCIAL',         short: 'NEWS',  color: '#3b82f6' },
  { id: 'fundamentals',      label: 'FUNDAMENTALS ANALYST',  short: 'FUND',  color: '#8b5cf6' },
  { id: 'bull_researcher',   label: 'BULL RESEARCHER',       short: 'BULL',  color: '#22c55e' },
  { id: 'bear_researcher',   label: 'BEAR RESEARCHER',       short: 'BEAR',  color: '#ef4444' },
  { id: 'research_manager',  label: 'RESEARCH MANAGER',      short: 'RSRCH', color: '#eab308' },
  { id: 'trader',            label: 'TRADER',                short: 'TRD',   color: '#06b6d4' },
  { id: 'risk_analysts',     label: 'RISK ANALYSTS (3x)',    short: 'RISK',  color: '#f97316' },
  { id: 'portfolio_manager', label: 'PORTFOLIO MANAGER',     short: 'PORT',  color: '#a855f7' },
];

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2,'0')}`;
}

export default function AgentLog({ status, agentProgress }) {
  const [elapsed, setElapsed]     = useState(0);
  const [activeIds, setActiveIds] = useState(new Set());
  const [doneIds, setDoneIds]     = useState(new Set());
  const [log, setLog]             = useState([]);
  const logRef                    = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setElapsed(p => p + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!agentProgress?.agent_id) return;
    const { agent_id, agent_name, status: st, status_message } = agentProgress;

    setActiveIds(prev => {
      const next = new Set(prev);
      if (st === 'started') next.add(agent_id);
      if (st === 'completed' || st === 'failed') next.delete(agent_id);
      return next;
    });
    setDoneIds(prev => {
      const next = new Set(prev);
      if (st === 'completed') next.add(agent_id);
      return next;
    });
    setLog(prev => [{
      id: `${agent_id}-${Date.now()}`,
      ts: formatTime(elapsed),
      agent: agent_name || agent_id,
      status: st,
      msg: status_message || '',
    }, ...prev].slice(0, 20));
  }, [agentProgress]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [log]);

  const doneCount = doneIds.size;
  const totalSteps = PIPELINE.length;
  const pct = Math.round((doneCount / totalSteps) * 100);

  return (
    <div className="border border-bloomberg-border bg-bloomberg-card animate-fade-up">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-bloomberg-border bg-black">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-bloomberg-orange animate-pulse-dot" />
            <span className="font-mono text-xs font-semibold text-bloomberg-orange tracking-wider">PIPELINE ACTIVE</span>
          </span>
          <span className="font-mono text-xs text-bloomberg-muted">SSE STREAM</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-bloomberg-white">{doneCount}/{totalSteps} AGENTS</span>
          <span className="font-mono text-xs text-bloomberg-orange">{formatTime(elapsed)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-0.5 bg-bloomberg-surface">
        <div
          className="h-full bg-bloomberg-orange transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex divide-x divide-bloomberg-border">
        {/* Left: pipeline steps */}
        <div className="flex-1 p-3">
          <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-3">Agent Pipeline</div>
          <div className="flex flex-col gap-1">
            {PIPELINE.map((step) => {
              const done   = doneIds.has(step.id);
              const active = activeIds.has(step.id);
              return (
                <div
                  key={step.id}
                  className={`
                    flex items-center gap-2.5 px-2 py-1.5 transition-colors duration-200
                    ${active ? 'bg-bloomberg-surface' : ''}
                  `}
                >
                  {/* Status indicator */}
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

                  {/* Color bar */}
                  <div
                    className="w-0.5 h-4 flex-shrink-0 transition-opacity duration-200"
                    style={{ background: step.color, opacity: done || active ? 1 : 0.2 }}
                  />

                  {/* Label */}
                  <span
                    className="font-mono text-xs tracking-wider flex-1 transition-colors duration-200"
                    style={{
                      color: done ? '#525252' : active ? '#e5e5e5' : '#3d3d3d',
                    }}
                  >
                    {step.label}
                  </span>

                  {/* Badge */}
                  {done && (
                    <span className="font-mono text-xs text-bloomberg-green">DONE</span>
                  )}
                  {active && (
                    <span className="font-mono text-xs animate-pulse-dot" style={{ color: step.color }}>LIVE</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: event log */}
        <div className="w-48 flex flex-col">
          <div className="px-3 py-3 border-b border-bloomberg-border">
            <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">Event Log</div>
          </div>
          <div ref={logRef} className="flex-1 overflow-y-auto p-2" style={{ maxHeight: 340 }}>
            {log.length === 0 ? (
              <div className="font-mono text-xs text-bloomberg-border p-1">Awaiting events...</div>
            ) : (
              <div className="flex flex-col gap-1">
                {log.map((ev) => (
                  <div key={ev.id} className="border-l-2 border-bloomberg-border pl-2 py-0.5">
                    <div className="font-mono text-xs text-bloomberg-muted">{ev.ts}</div>
                    <div className="font-mono text-xs text-bloomberg-white truncate">{ev.agent}</div>
                    <div className={`font-mono text-xs ${ev.status === 'completed' ? 'text-bloomberg-green' : ev.status === 'failed' ? 'text-bloomberg-red' : 'text-bloomberg-orange'}`}>
                      {(ev.status || '').toUpperCase()}
                    </div>
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

      {/* Bottom pct */}
      <div className="border-t border-bloomberg-border px-4 py-2 flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full bg-bloomberg-orange animate-pulse-dot" />
        <span className="font-mono text-xs text-bloomberg-muted tracking-wider">
          PROGRESS: {pct}% — {doneCount} of {totalSteps} agents complete
        </span>
      </div>
    </div>
  );
}
