import React, { useState, useEffect } from 'react';

const agentSteps = [
  { id: 'init', label: 'Initializing agents', icon: '⬡', color: '#60a5fa' },
  { id: 'market', label: 'Market Analyst working', icon: '📊', color: '#00e5a0' },
  { id: 'news', label: 'News Researcher scanning', icon: '📰', color: '#60a5fa' },
  { id: 'risk', label: 'Risk Manager evaluating', icon: '⚖️', color: '#ffb340' },
  { id: 'portfolio', label: 'Portfolio Manager deciding', icon: '🧠', color: '#c084fc' },
];

export default function AgentLog({ status }) {
  const [activeStep, setActiveStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const stepInterval = setInterval(() => {
      setActiveStep(prev => {
        if (prev < agentSteps.length - 1) return prev + 1;
        return prev;
      });
    }, 30000);

    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(stepInterval);
      clearInterval(timer);
    };
  }, []);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
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
          const isDone = i < activeStep;
          const isActive = i === activeStep;

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
              {/* Status indicator */}
              <div style={{ width: 20, height: 20, flexShrink: 0, position: 'relative' }}>
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
                  }}>
                    ✓
                  </div>
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
                }}>
                  done
                </span>
              )}

              {isActive && (
                <span style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: step.color,
                  animation: 'pulse-dot 1.5s ease infinite',
                }}>
                  ···
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Status text */}
      {status && (
        <div style={{
          marginTop: 16,
          paddingTop: 16,
          borderTop: '1px solid var(--border-subtle)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--text-muted)',
          animation: 'fadeIn 0.3s ease',
        }}>
          {status}
        </div>
      )}
    </div>
  );
}