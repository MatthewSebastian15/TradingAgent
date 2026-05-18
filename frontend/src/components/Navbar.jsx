import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    <span className="text-bloomberg-orange font-mono text-xs tracking-wider">
      {pad(time.getHours())}:{pad(time.getMinutes())}:{pad(time.getSeconds())} WIB
    </span>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === '/home';
  const isAnalysis = ['/analysis', '/analysis-live', '/analysis.test'].includes(location.pathname);

  return (
    <nav className="sticky top-0 z-50 border-b border-bloomberg-border bg-bloomberg-bg">
      {/* Top status bar */}
      <div className="flex items-center justify-between px-4 h-7 border-b border-bloomberg-border bg-black">
        <div className="flex items-center gap-4">
          <span className="text-bloomberg-orange font-mono text-xs font-semibold tracking-widest">TRADINGAGENTS</span>
          <span className="text-bloomberg-muted font-mono text-xs">MULTI-AGENT AI RESEARCH TERMINAL</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-bloomberg-green animate-pulse-dot" />
            <span className="text-bloomberg-green font-mono text-xs">LIVE</span>
          </span>
          <Clock />
        </div>
      </div>

      {/* Main nav */}
      <div className="flex items-center justify-between px-4 h-10">
        <div className="flex items-center gap-0">
          {[
            { label: 'DASHBOARD', path: '/home', active: isHome },
            { label: 'ANALYSIS', path: '/analysis', active: isAnalysis },
          ].map(({ label, path, active }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`
                h-10 px-4 text-xs font-mono font-medium tracking-wider border-r border-bloomberg-border
                transition-colors duration-150 relative
                ${active
                  ? 'bg-bloomberg-orange text-black'
                  : 'text-bloomberg-muted hover:text-bloomberg-white hover:bg-bloomberg-surface'}
              `}
            >
              {label}
              {active && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-bloomberg-orange" />
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 text-xs font-mono text-bloomberg-muted">
          <span>9 AGENTS</span>
          <span className="text-bloomberg-border">|</span>
          <span>v2.0</span>
        </div>
      </div>
    </nav>
  );
}
