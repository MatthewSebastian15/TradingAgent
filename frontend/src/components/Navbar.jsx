import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import { createClockFormatter, resolveClockConfig } from '../utils/clock';

const CLOCK_CONFIG = resolveClockConfig();
const CLOCK_FORMATTER = createClockFormatter(CLOCK_CONFIG);
const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLOCK_CONFIG.timeZone,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const NAV_ITEMS = [
  { label: 'Home', path: '/home', matchPrefixes: ['/home'] },
  {
    label: 'AI Agent',
    path: '/analysis',
    matchPrefixes: ['/analysis', '/analysis-live', '/analysis.test'],
  },
  { label: 'News', path: '/news', matchPrefixes: ['/news'] },
  { label: 'Market', path: '/market', matchPrefixes: ['/market'] },
];

function formatDate(value) {
  const parts = DATE_FORMATTER.formatToParts(value);

  const day = parts.find((part) => part.type === 'day')?.value ?? '00';
  const month = parts.find((part) => part.type === 'month')?.value ?? 'January';
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';

  return `${day} ${month} ${year}`;
}

function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const intervalId = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <div className="flex items-center gap-3 font-mono text-xs tracking-wider text-bloomberg-orange">
      <span>{formatDate(now)}</span>
      <span>
        {CLOCK_FORMATTER.format(now)} {CLOCK_CONFIG.label}
      </span>
    </div>
  );
}

function LiveStatus() {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-bloomberg-green animate-pulse-dot" />
      <span className="text-bloomberg-green font-mono text-xs">LIVE</span>
    </span>
  );
}

function isNavItemActive(item, pathname) {
  return item.matchPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function NavButton({ item, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative h-10 border-r border-bloomberg-border px-4 font-mono text-xs font-medium tracking-wider transition-colors duration-150 first:border-l sm:px-5 ${
        active
          ? 'bg-bloomberg-orange text-black'
          : 'text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      {item.label}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-bloomberg-orange" />}
    </button>
  );
}

NavButton.propTypes = {
  item: PropTypes.shape({
    label: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    matchPrefixes: PropTypes.arrayOf(PropTypes.string).isRequired,
  }).isRequired,
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="sticky top-0 z-50 border-b border-bloomberg-border bg-black">
      <div className="flex h-10 items-center justify-between border-b border-bloomberg-border">
        <div className="flex min-w-0 flex-1 items-center gap-0 overflow-x-auto">
          {NAV_ITEMS.map((item) => (
            <NavButton
              key={item.path}
              item={item}
              active={isNavItemActive(item, location.pathname)}
              onClick={() => navigate(item.path)}
            />
          ))}
        </div>

        <div className="ml-auto flex min-w-max items-center gap-4 px-4">
          <LiveStatus />
          <Clock />
        </div>
      </div>
    </nav>
  );
}
