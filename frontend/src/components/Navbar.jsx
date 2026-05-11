import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const styles = {
  nav: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: 64,
    backgroundColor: 'rgba(7, 10, 15, 0.85)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid var(--border-subtle)',
  },
  logo: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    textDecoration: 'none',
    cursor: 'pointer',
  },
  logoIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    boxShadow: '0 0 16px rgba(0, 229, 160, 0.3)',
  },
  logoText: {
    fontFamily: 'var(--font-display)',
    fontSize: 17,
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '-0.3px',
  },
  logoSub: {
    fontFamily: 'var(--font-mono)',
    fontSize: 10,
    color: 'var(--accent)',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    fontWeight: 400,
  },
  navLinks: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  navLink: (active) => ({
    padding: '6px 14px',
    borderRadius: 'var(--radius-sm)',
    fontSize: 13,
    fontWeight: 500,
    fontFamily: 'var(--font-display)',
    color: active ? 'var(--accent)' : 'var(--text-secondary)',
    background: active ? 'var(--accent-dim)' : 'transparent',
    border: 'none',
    cursor: 'pointer',
    transition: 'var(--transition)',
    textDecoration: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }),
  badge: {
    background: 'var(--accent-dim)',
    color: 'var(--accent)',
    fontSize: 10,
    fontFamily: 'var(--font-mono)',
    fontWeight: 500,
    padding: '2px 6px',
    borderRadius: 4,
    border: '1px solid rgba(0,229,160,0.2)',
  },
};

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav style={styles.nav}>
      <div style={styles.logo} onClick={() => navigate('/')}>
        <div style={styles.logoIcon}>⬡</div>
        <div>
          <div style={styles.logoText}>TradingAgents</div>
          <div style={styles.logoSub}>Multi-Agent AI</div>
        </div>
      </div>

      <div style={styles.navLinks}>
        <button
          style={styles.navLink(location.pathname === '/')}
          onClick={() => navigate('/')}
        >
          Dashboard
        </button>
        <button
          style={styles.navLink(location.pathname === '/analysis')}
          onClick={() => navigate('/analysis')}
        >
          Analysis
          <span style={styles.badge}>AI</span>
        </button>
      </div>
    </nav>
  );
}