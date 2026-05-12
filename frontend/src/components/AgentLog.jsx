import React, { useState, useEffect } from 'react';

const agentSteps = [
  { id: 'init',      label: 'Initializing agents',       icon: '⬡',  color: '#60a5fa' },
  { id: 'market',   label: 'Market Analyst working',     icon: '📊', color: '#00e5a0' },
  { id: 'news',     label: 'News Researcher scanning',   icon: '📰', color: '#60a5fa' },
  { id: 'risk',     label: 'Risk Manager evaluating',    icon: '⚖️', color: '#ffb340' },
  { id: 'portfolio',label: 'Portfolio Manager deciding', icon: '🧠', color: '#c084fc' },
];

// Perkiraan waktu (detik) setiap step selesai sejak analisis dimulai.
// Portfolio Manager adalah step terberat dan bisa membutuhkan waktu paling lama,
// jadi step ini tidak akan pernah otomatis ditandai "done" — ia tetap berjalan
// sampai respons API benar-benar kembali dari backend.
const STEP_THRESHOLDS = [
  3,   // Initializing agents     — selesai di detik ke-3
  45,  // Market Analyst          — selesai di detik ke-45
  90,  // News Researcher         — selesai di detik ke-90
  150, // Risk Manager            — selesai di detik ke-150
  // Portfolio Manager tidak punya threshold — ia aktif sampai selesai
];

export default function AgentLog({ status }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Hitung step aktif berdasarkan waktu nyata, bukan interval tetap.
  // activeStep adalah index step yang sedang berjalan sekarang.
  const activeStep = STEP_THRESHOLDS.reduce(
    (current, threshold) => (elapsed >= threshold ? current + 1 : current),
    0
  );

  // Jika sudah melewati semua threshold, Portfolio Manager sedang aktif (index 4).
  const clampedActive = Math.min(activeStep, agentSteps.length - 1);

  const formatTime = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  // Pesan bawah yang berubah sesuai waktu agar user tahu proses masih berjalan.
  const getStatusMessage = () => {
    if (elapsed < 10)  return 'Starting up agents and fetching market data...';
    if (elapsed < 60)  return 'Market Analyst fetching price and indicator data...';
    if (elapsed < 120) return 'News Researcher scanning recent headlines and filings...';
    if (elapsed < 180) return 'Risk Manager running bull/bear debate analysis...';
    if (elapsed < 300) return 'Portfolio Manager synthesizing all reports into a final decision...';
    return `Portfolio Manager still working... (${formatTime(elapsed)} elapsed). Gemini API sedang memproses konteks panjang, harap tunggu.`;
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
          const isDone   = i < clampedActive;
          const isActive = i === clampedActive;

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
      <div style={{
        marginTop: 16,
        paddingTop: 16,
        borderTop: '1px solid var(--border-subtle)',
        fontFamily: 'var(--font-mono)',
        fontSize: 12,
        color: 'var(--text-muted)',
        animation: 'fadeIn 0.3s ease',
        lineHeight: 1.6,
      }}>
        {status || getStatusMessage()}
      </div>
    </div>
  );
}