import { Landmark, Microscope, Newspaper, Home, Sparkles, TrendingUp } from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import {
  AI_AGENT_MOCK_PATH,
  AI_AGENT_PATH,
  LEGACY_AI_AGENT_LOWER_PATH,
  LEGACY_AI_AGENT_MOCK_LOWER_PATH,
  LEGACY_AI_AGENT_MOCK_OLD_PATH,
  LEGACY_AI_AGENT_OLD_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_PATH,
} from '../constants/routes';
import { createClockFormatter, resolveClockConfig } from '../utils/clock';

const CLOCK_CONFIG = resolveClockConfig();
const CLOCK_FORMATTER = createClockFormatter(CLOCK_CONFIG);
const DATE_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: CLOCK_CONFIG.timeZone,
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

const AI_AGENT_MATCH_PREFIXES = [
  AI_AGENT_PATH,
  encodeURI(AI_AGENT_PATH),
  AI_AGENT_MOCK_PATH,
  encodeURI(AI_AGENT_MOCK_PATH),
  LEGACY_AI_AGENT_OLD_PATH,
  encodeURI(LEGACY_AI_AGENT_OLD_PATH),
  LEGACY_AI_AGENT_LOWER_PATH,
  encodeURI(LEGACY_AI_AGENT_LOWER_PATH),
  LEGACY_AI_AGENT_MOCK_OLD_PATH,
  encodeURI(LEGACY_AI_AGENT_MOCK_OLD_PATH),
  LEGACY_AI_AGENT_MOCK_LOWER_PATH,
  encodeURI(LEGACY_AI_AGENT_MOCK_LOWER_PATH),
  LEGACY_ANALYSIS_PATH,
  LEGACY_ANALYSIS_LIVE_PATH,
  LEGACY_ANALYSIS_MOCK_PATH,
  LEGACY_ANALYSIS_MOCK_ALIAS_PATH,
];

const NAV_ITEMS = [
  { label: 'Home', path: '/home', matchPrefixes: ['/home'], Icon: Home },
  {
    label: 'AI Agent',
    path: AI_AGENT_PATH,
    matchPrefixes: AI_AGENT_MATCH_PREFIXES,
    Icon: Sparkles,
  },
  {
    label: 'Research',
    path: '/research',
    matchPrefixes: ['/research'],
    Icon: Microscope,
  },
  { label: 'News', path: '/news', matchPrefixes: ['/news'], Icon: Newspaper },
  { label: 'Market', path: '/market', matchPrefixes: ['/market'], Icon: TrendingUp },
  { label: 'ECON', path: '/econ', matchPrefixes: ['/econ', '/economic'], Icon: Landmark },
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
    <div className="flex items-center gap-2 font-mono text-[10px] leading-none tracking-wider text-bloomberg-orange">
      <span>{formatDate(now)}</span>
      <span>
        {CLOCK_FORMATTER.format(now)} {CLOCK_CONFIG.label}
      </span>
    </div>
  );
}

function LiveStatus() {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full bg-bloomberg-green animate-pulse-dot" />
      <span className="font-mono text-[10px] leading-none text-bloomberg-green">LIVE</span>
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
  const button = (
    <button
      type="button"
      aria-disabled={item.disabled || undefined}
      onClick={item.disabled ? undefined : onClick}
      className={`relative inline-flex h-7 items-center gap-1.5 border-r border-bloomberg-border px-3 font-mono text-[11px] font-medium leading-none tracking-wider transition-colors duration-150 first:border-l sm:px-4 ${
        item.disabled
          ? 'cursor-not-allowed text-bloomberg-border opacity-55'
          : active
            ? 'bg-bloomberg-orange text-black'
            : 'text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.7} />
      {item.label}
      {active && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-bloomberg-orange" />}
    </button>
  );

  if (!item.disabled) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent className="rounded-none border-bloomberg-border bg-black font-mono text-xs text-bloomberg-orange">
        {item.tooltip || 'Coming soon'}
      </TooltipContent>
    </Tooltip>
  );
}

NavButton.propTypes = {
  item: PropTypes.shape({
    disabled: PropTypes.bool,
    label: PropTypes.string.isRequired,
    matchPrefixes: PropTypes.arrayOf(PropTypes.string).isRequired,
    path: PropTypes.string.isRequired,
    Icon: PropTypes.elementType.isRequired,
    tooltip: PropTypes.string,
  }).isRequired,
  active: PropTypes.bool.isRequired,
  onClick: PropTypes.func.isRequired,
};

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <TooltipProvider delayDuration={150}>
      <nav className="sticky top-0 z-50 border-b border-bloomberg-border bg-black">
        <div className="flex h-7 items-center justify-between border-b border-bloomberg-border">
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

          <div className="ml-auto flex min-w-max items-center gap-3 px-3">
            <LiveStatus />
            <Clock />
          </div>
        </div>
      </nav>
    </TooltipProvider>
  );
}
