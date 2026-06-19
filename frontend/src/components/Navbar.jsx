import {
  Cpu,
  Landmark,
  Microscope,
  Newspaper,
  Home,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import PropTypes from 'prop-types';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import TickerTape from './TickerTape';
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
  WATCHLIST_PATH,
} from '../constants/routes';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';
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

const ENGINE_STATUS_ROWS = [
  {
    key: 'agentPipeline',
    label: 'AGENT PIPELINE',
    getReady: (status) => status.ok,
    getOfflineStatus: () => 'UNKNOWN',
  },
  {
    key: 'llmBackend',
    label: 'LLM BACKEND',
    getReady: (status) => status.ok,
    getOfflineStatus: () => 'OFFLINE',
  },
  {
    key: 'marketData',
    label: 'MARKET DATA',
    getReady: (status) => status.toolCacheOk,
    getOfflineStatus: () => 'LIMITED',
  },
  {
    key: 'sseStream',
    label: 'SSE STREAM',
    getReady: (status) => status.ok,
    getOfflineStatus: () => 'UNKNOWN',
  },
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
  { label: 'Watchlist', path: WATCHLIST_PATH, matchPrefixes: [WATCHLIST_PATH], Icon: Star },
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

function buildEngineRows(status) {
  return ENGINE_STATUS_ROWS.map((row) => {
    const ready = Boolean(row.getReady(status));
    const tone = status.loading ? 'warn' : ready ? 'ok' : row.key === 'marketData' ? 'warn' : 'bad';

    return {
      key: row.key,
      label: row.label,
      status: status.loading ? 'CHECKING' : ready ? 'READY' : row.getOfflineStatus(status),
      tone,
    };
  });
}

function EngineStatus() {
  const [status, setStatus] = useState({
    loading: true,
    ok: false,
    error: null,
    toolCacheOk: false,
  });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function checkEngineStatus() {
      try {
        const response = await fetch(buildApiUrl('/status'), {
          headers: await buildAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();

        if (!active) return;

        setStatus({
          loading: false,
          ok: true,
          error: null,
          toolCacheOk: !payload.tool_cache?.error,
        });
      } catch (error) {
        if (!active || error.name === 'AbortError') return;

        setStatus({
          loading: false,
          ok: false,
          error: error.message || 'Backend unavailable',
          toolCacheOk: false,
        });
      }
    }

    checkEngineStatus();

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  const rows = buildEngineRows(status);
  const readyCount = rows.filter((row) => row.status === 'READY').length;
  const statusLabel = status.loading
    ? 'CHECKING'
    : readyCount === rows.length
      ? `${readyCount}/${rows.length} READY`
      : `${readyCount}/${rows.length} LIMITED`;
  const statusClass = status.loading
    ? 'text-bloomberg-amber'
    : readyCount === rows.length
      ? 'text-bloomberg-green'
      : 'text-bloomberg-amber';
  const toneClass = {
    ok: 'text-bloomberg-green',
    warn: 'text-bloomberg-amber',
    bad: 'text-bloomberg-red',
  };
  const toneMarker = {
    ok: '●',
    warn: '◐',
    bad: '○',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1.5 border border-bloomberg-border bg-bloomberg-bg px-2 font-mono text-[10px] leading-none tracking-wider text-bloomberg-muted transition-colors hover:border-bloomberg-orange/70 hover:text-bloomberg-white"
          aria-label={`Engine status ${statusLabel}`}
        >
          <Cpu className="h-3.5 w-3.5" strokeWidth={1.8} />
          <span className={statusClass}>{statusLabel}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent
        align="end"
        className="w-64 rounded-none border-bloomberg-border bg-black p-0 font-mono text-xs text-bloomberg-muted shadow-xl shadow-black/40"
      >
        <div className="border-b border-bloomberg-border px-3 py-2 text-[10px] font-bold tracking-[0.25em] text-bloomberg-orange">
          ENGINE STATUS
        </div>
        <div className="px-3 py-2">
          {rows.map((row) => (
            <div
              key={row.key}
              title={row.tone === 'bad' ? status.error || 'Backend status check failed' : undefined}
              className="flex items-center justify-between gap-3 py-1"
            >
              <span className="text-[10px] tracking-wider text-bloomberg-muted">{row.label}</span>
              <span className={`text-[10px] tracking-wider ${toneClass[row.tone]}`}>
                {toneMarker[row.tone]} {row.status}
              </span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
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
      className={`relative inline-flex h-8 items-center gap-1.5 border-r border-bloomberg-border px-3 font-mono text-[11px] font-medium leading-none tracking-wider transition-colors duration-150 first:border-l sm:px-4 ${
        item.disabled
          ? 'cursor-not-allowed text-bloomberg-border opacity-55'
          : active
            ? 'bg-bloomberg-orange text-black'
            : 'text-bloomberg-muted hover:bg-bloomberg-surface hover:text-bloomberg-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5 flex-shrink-0" strokeWidth={1.8} />
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
      <nav className="fixed left-0 right-0 top-0 z-50 bg-black">
        <div className="flex h-8 items-center justify-between border-b border-bloomberg-border">
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
            <EngineStatus />
            <LiveStatus />
            <Clock />
          </div>
        </div>
        <TickerTape />
      </nav>
    </TooltipProvider>
  );
}
