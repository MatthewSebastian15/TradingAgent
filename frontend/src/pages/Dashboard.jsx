import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';

const agents = [
  { icon: '📊', name: 'Market Analyst', desc: 'Reads price action, volume, and trend signals', color: '#00e5a0' },
  { icon: '📰', name: 'News Researcher', desc: 'Scans news sentiment and macro events', color: '#60a5fa' },
  { icon: '⚖️', name: 'Risk Manager', desc: 'Evaluates downside and position sizing', color: '#ffb340' },
  { icon: '🧠', name: 'Portfolio Manager', desc: 'Issues final BUY / HOLD / SELL decision', color: '#c084fc' },
];

const tickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL'];

function TickerTape() {
  return (
    <div style={{
      overflow: 'hidden',
      borderTop: '1px solid var(--border-subtle)',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'var(--bg-surface)',
      padding: '10px 0',
      position: 'relative',
    }}>
      <div style={{
        display: 'flex',
        gap: 48,
        animation: 'marquee 20s linear infinite',
        width: 'max-content',
      }}>
        {[...tickers, ...tickers].map((t, i) => (
          <span key={i} style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: i % 3 === 0 ? 'var(--accent)' : i % 3 === 1 ? 'var(--text-secondary)' : '#60a5fa',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}>
            {t}
            <span style={{ color: Math.random() > 0.5 ? 'var(--accent)' : 'var(--red)', fontSize: 10 }}>
              {Math.random() > 0.5 ? '▲' : '▼'} {(Math.random() * 3).toFixed(2)}%
            </span>
          </span>
        ))}
      </div>
      <style>{`
        @keyframes marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function AgentCard({ agent, index }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-card-hover)' : 'var(--bg-card)',
        border: `1px solid ${hovered ? 'var(--border-active)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        transition: 'var(--transition)',
        cursor: 'default',
        animation: `fadeUp 0.5s ease ${index * 0.1}s both`,
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? `0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px ${agent.color}22` : 'none',
      }}
    >
      <div style={{
        width: 44,
        height: 44,
        borderRadius: 'var(--radius-md)',
        background: `${agent.color}18`,
        border: `1px solid ${agent.color}30`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        marginBottom: 16,
        transition: 'var(--transition)',
        boxShadow: hovered ? `0 0 16px ${agent.color}30` : 'none',
      }}>
        {agent.icon}
      </div>
      <div style={{
        fontFamily: 'var(--font-display)',
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--text-primary)',
        marginBottom: 6,
      }}>
        {agent.name}
      </div>
      <div style={{
        fontSize: 13,
        color: 'var(--text-secondary)',
        lineHeight: 1.5,
        fontFamily: 'var(--font-display)',
        fontWeight: 400,
      }}>
        {agent.desc}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />
      <TickerTape />

      {/* Hero */}
      <div style={{
        maxWidth: 900,
        margin: '0 auto',
        padding: '80px 32px 64px',
        textAlign: 'center',
      }}>
        {/* Status pill */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          background: 'var(--accent-dim)',
          border: '1px solid rgba(0,229,160,0.2)',
          borderRadius: 100,
          padding: '6px 16px',
          marginBottom: 32,
          animation: mounted ? 'fadeIn 0.6s ease both' : 'none',
        }}>
          <span style={{
            width: 7, height: 7,
            borderRadius: '50%',
            background: 'var(--accent)',
            animation: 'pulse-dot 2s ease infinite',
            display: 'inline-block',
          }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--accent)',
            fontWeight: 500,
            letterSpacing: '0.05em',
          }}>
            4 AI AGENTS READY
          </span>
        </div>

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(36px, 6vw, 64px)',
          fontWeight: 800,
          color: 'var(--text-primary)',
          lineHeight: 1.08,
          letterSpacing: '-1.5px',
          marginBottom: 20,
          animation: mounted ? 'fadeUp 0.6s ease 0.1s both' : 'none',
        }}>
          Smarter trades,<br />
          <span style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, #60efb8 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            driven by agents.
          </span>
        </h1>

        <p style={{
          fontSize: 16,
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          maxWidth: 520,
          margin: '0 auto 40px',
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          animation: mounted ? 'fadeUp 0.6s ease 0.2s both' : 'none',
        }}>
          Enter a ticker and date. Four specialized AI agents collaborate,
          debate, and deliver a final trade decision with reasoning.
        </p>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          animation: mounted ? 'fadeUp 0.6s ease 0.3s both' : 'none',
        }}>
          <button
            onClick={() => navigate('/analysis')}
            style={{
              background: 'var(--accent)',
              color: '#070a0f',
              border: 'none',
              padding: '14px 32px',
              borderRadius: 'var(--radius-md)',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              letterSpacing: '0.02em',
              transition: 'var(--transition)',
              boxShadow: '0 0 24px rgba(0,229,160,0.3)',
            }}
            onMouseEnter={e => {
              e.target.style.background = '#00ffb3';
              e.target.style.boxShadow = '0 0 36px rgba(0,229,160,0.5)';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.target.style.background = 'var(--accent)';
              e.target.style.boxShadow = '0 0 24px rgba(0,229,160,0.3)';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            Start Analysis →
          </button>
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.05em',
          }}>
            Takes ~2–3 min
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 32px' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          marginBottom: 32,
        }}>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-muted)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Agent Pipeline
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>

        {/* Agent grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 16,
          marginBottom: 80,
        }}>
          {agents.map((agent, i) => (
            <AgentCard key={i} agent={agent} index={i} />
          ))}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: '1px solid var(--border-subtle)',
        padding: '24px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--text-muted)',
        }}>
          TradingAgents · Multi-Agent LLM Trading System
        </span>
      </div>
    </div>
  );
}