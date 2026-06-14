import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useLocation, useNavigate } from 'react-router-dom';
import { createClockFormatter, resolveClockConfig } from '../utils/clock';
import {
  AI_RESEARCH_MOCK_PATH,
  AI_RESEARCH_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_PATH,
} from '../constants/routes';

const CLOCK_CONFIG = resolveClockConfig();
const CLOCK_FORMATTER = createClockFormatter(CLOCK_CONFIG);
const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLOCK_CONFIG.timeZone,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

function HomeIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m3 10.5 9-7 9 7" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9 21v-7h6v7" />
    </svg>
  );
}

function SparklesIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" />
      <path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" />
    </svg>
  );
}

function NewspaperIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M4 22h14a2 2 0 0 0 2-2V4H2v16a2 2 0 0 0 2 2Z" />
      <path d="M8 6h8M8 10h8M8 14h5M6 18h10" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

const AI_RESEARCH_MATCH_PREFIXES = [
  AI_RESEARCH_PATH,
  encodeURI(AI_RESEARCH_PATH),
  AI_RESEARCH_MOCK_PATH,
  encodeURI(AI_RESEARCH_MOCK_PATH),
  LEGACY_ANALYSIS_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
];

const NAV_ITEMS = [
  { label: 'Home', path: '/home', matchPrefixes: ['/home'], Icon: HomeIcon },
  {
    label: 'AI Research',
    path: AI_RESEARCH_PATH,
    matchPrefixes: AI_RESEARCH_MATCH_PREFIXES,
    Icon: SparklesIcon,
  },
  { label: 'News', path: '/news', matchPrefixes: ['/news'], Icon: NewspaperIcon },
  { label: 'Market', path: '/market', matchPrefixes: ['/market'], Icon: TrendingUpIcon },
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
  const Icon = item.Icon;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex h-10 items-center gap-2 border-r border-bloomberg-border px-4 font-mono text-xs font-medium tracking-wider transition-colors duration-150 first:border-l sm:px-5 ${
        active
          ? 'bg-bloomberg-orange text-black'
          : 'text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      <Icon />
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
    Icon: PropTypes.elementType.isRequired,
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
