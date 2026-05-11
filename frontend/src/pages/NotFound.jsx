import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';

export default function NotFound() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-base)' }}>
      <Navbar />

      <div style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '100px 32px 64px',
        textAlign: 'center',
        animation: mounted ? 'fadeUp 0.5s ease both' : 'none',
      }}>

        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 'clamp(80px, 15vw, 130px)',
          fontWeight: 700,
          color: 'var(--border-active)',
          lineHeight: 1,
          marginBottom: 8,
          letterSpacing: '-4px',
          userSelect: 'none',
        }}>
          404
        </div>

        <div style={{
          width: 48,
          height: 3,
          background: 'var(--accent)',
          borderRadius: 2,
          margin: '0 auto 28px',
          boxShadow: '0 0 12px rgba(0,229,160,0.4)',
        }} />

        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          fontWeight: 700,
          color: 'var(--text-primary)',
          marginBottom: 12,
          letterSpacing: '-0.3px',
        }}>
          Page not found
        </h1>

        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          color: 'var(--text-secondary)',
          lineHeight: 1.65,
          marginBottom: 12,
        }}>
          The page{' '}
          <code style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            padding: '2px 8px',
            borderRadius: 4,
            border: '1px solid rgba(0,229,160,0.2)',
          }}>
            {location.pathname}
          </code>{' '}
          does not exist.
        </p>

        <p style={{
          fontFamily: 'var(--font-display)',
          fontSize: 13,
          color: 'var(--text-muted)',
          marginBottom: 40,
        }}>
          Check the URL or go back to a valid page.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/home')}
            style={{
              background: 'var(--accent)',
              color: '#070a0f',
              border: 'none',
              padding: '12px 24px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              fontWeight: 700,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              transition: 'var(--transition)',
              boxShadow: '0 0 20px rgba(0,229,160,0.25)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = '#00ffb3';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'var(--accent)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Go to Dashboard
          </button>

          <button
            onClick={() => navigate(-1)}
            style={{
              background: 'var(--bg-card)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              padding: '12px 24px',
              borderRadius: 'var(--radius-md)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'var(--font-display)',
              cursor: 'pointer',
              transition: 'var(--transition)',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--border-active)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            ← Go back
          </button>
        </div>
      </div>

      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        borderTop: '1px solid var(--border-subtle)',
        padding: '16px 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(7,10,15,0.9)',
        backdropFilter: 'blur(12px)',
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