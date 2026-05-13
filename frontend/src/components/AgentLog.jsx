import React, { useState, useEffect } from 'react';

const agentSteps = [
  { id: 'market_analyst',    label: 'Market Analyst',       icon: '📊', color: '#00e5a0' },
  { id: 'news_analyst',      label: 'News Researcher',      icon: '📰', color: '#60a5fa' },
  { id: 'fundamentals',      label: 'Fundamentals Analyst', icon: '📈', color: '#a78bfa' },
  { id: 'bull_researcher',   label: 'Bull Researcher',      icon: '🐂', color: '#34d399' },
  { id: 'bear_researcher',   label: 'Bear Researcher',      icon: '🐻', color: '#f87171' },
  { id: 'research_manager',  label: 'Research Manager',     icon: '🔬', color: '#fbbf24' },
  { id: 'trader',            label: 'Trader',               icon: '💹', color: '#38bdf8' },
  { id: 'risk_analysts',     label: 'Risk Analysts',        icon: '⚖️', color: '#ffb340' },
  { id: 'portfolio_manager', label: 'Portfolio Manager',    icon: '🧠', color: '#c084fc' },
];

// Time-based thresholds (seconds) matching backend estimates for gemini-2.5-flash.
// Used as fallback only when SSE progress events are not yet received.
const STEP_THRESHOLDS = [0, 20, 45, 70, 90, 110, 125, 135, 160];

export default function AgentLog({ status, agentProgress }) {
  const [elapsed, setElapsed]           = useState(0);
  const [sseActiveIndex, setSseActiveIndex] = useState(null);

  // Tick every second
  useEffect(() => {
    const timer = setInterval(() => setElapsed(prev => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // SSE progress event: find the matching agent step by agent_id or agent_name
  useEffect(() => {
    if (!agentProgress) return;
    const idx = agentSteps.findIndex(
      s =>
        s.id === agentProgress.agent_id ||
        s.label.toLowerCase() === (agentProgress.agent_name || '').toLowerCase()
    );
    if (idx !== -1) setSseActiveIndex(idx);
  }, [agentProgress]);

  // SSE takes priority. Timer fallback activates only before first SSE event.
  const timerActive = STEP_THRESHOLDS.reduce(
    (cur, t) => (elapsed >= t ? cur + 1 : cur), 0
  ) - 1;

  const activeIndex = sseActiveIndex !== null
    ? sseActiveIndex
    : Math.min(Math.max(timerActive, 0), agentSteps.length - 1);

  const formatTime = (s) => {
    const m   = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  const getStatusMessage = () => {
    if (agentProgress?.status_message) return agentProgress.status_message;
    if (status) return status;
    const current = agentSteps[activeIndex];
    return current ? `${current.label} is working...` : 'Starting up agents...';
  };

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-lg)',
      padding: '24px',
      animation: 'fadeUp 0.4s ease both',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 8, height: 8,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse-dot 1.5s ease infinite',
            boxShadow: '0 0 8px var(--accent)',
          }} />
          <span style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}>
            Agents Running
          </span>
          {sseActiveIndex !== null && (
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--accent)',
              background: 'var(--accent-dim)',
              padding: '2px 7px',
              borderRadius: 4,
              letterSpacing: '0.05em',
            }}>
              LIVE
            </span>
          )}
        </div>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
          background: 'var(--bg-surface)',
          padding: '4px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}>
          {formatTime(elapsed)}
        </span>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {agentSteps.map((step, i) => {
          const isDone   = i < activeIndex;
          const isActive = i === activeIndex;

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: isActive ? `${step.color}0a` : 'transparent',
                border: `1px solid ${isActive ? `${step.color}25` : 'transparent'}`,
                transition: 'var(--transition)',
              }}
            >
              <div style={{ width: 20, height: 20, flexShrink: 0 }}>
                {isDone ? (
                  <div style={{
                    width: 20, height: 20,
                    borderRadius: '50%',
                    background: 'var(--accent-dim)',
                    border: '1px solid var(--accent)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    color: 'var(--accent)',
                  }}>✓</div>
                ) : isActive ? (
                  <div style={{
                    width: 20, height: 20,
                    border: `2px solid ${step.color}`,
                    borderTopColor: 'transparent',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }} />
                ) : (
                  <div style={{
                    width: 20, height: 20,
                    borderRadius: '50%',
                    border: '1px solid var(--border)',
                    background: 'var(--bg-surface)',
                  }} />
                )}
              </div>

              <span style={{ fontSize: 16, flexShrink: 0 }}>{step.icon}</span>

              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                color: isDone
                  ? 'var(--text-secondary)'
                  : isActive
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                flex: 1,
              }}>
                {step.label}
              </span>

              {isDone && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--accent)',
                  background: 'var(--accent-dim)',
                  padding: '2px 8px',
                  borderRadius: 4,
                }}>done</span>
              )}

              {isActive && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: step.color,
                  animation: 'pulse-dot 1.5s ease infinite',
                }}>···</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Status text */}
      <div style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-muted)',
        lineHeight: 1.6,
      }}>
        {getStatusMessage()}
      </div>
    </div>
  );
}
