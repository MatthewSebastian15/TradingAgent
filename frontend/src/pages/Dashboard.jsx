import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AI_RESEARCH_PATH } from '../constants/routes';
import Navbar from '../components/Navbar';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';
import { formatTickerLabel } from '../utils/formatting';

const AGENTS = [
  {
    short: 'MKT',
    label: 'MARKET ANALYST',
    desc: 'Price action, volume, technical indicators',
    color: '#06b6d4',
  },
  {
    short: 'NEWS',
    label: 'NEWS RESEARCHER',
    desc: 'Headlines, sentiment, macro events',
    color: '#3b82f6',
  },
  {
    short: 'FUND',
    label: 'FUNDAMENTALS ANALYST',
    desc: 'Financials, ratios, balance sheet',
    color: '#8b5cf6',
  },
  {
    short: 'BULL',
    label: 'BULL RESEARCHER',
    desc: 'Long-side investment thesis',
    color: '#22c55e',
  },
  {
    short: 'BEAR',
    label: 'BEAR RESEARCHER',
    desc: 'Short-side counterargument',
    color: '#ef4444',
  },
  {
    short: 'RSRCH',
    label: 'RESEARCH MANAGER',
    desc: 'Debate evaluation and synthesis',
    color: '#eab308',
  },
  {
    short: 'TRD',
    label: 'TRADER',
    desc: 'Transaction proposal generation',
    color: '#06b6d4',
  },
  {
    short: 'RISK',
    label: 'RISK ANALYSTS (3×)',
    desc: 'Aggressive / conservative / neutral debate',
    color: '#f97316',
  },
  {
    short: 'PORT',
    label: 'PORTFOLIO MANAGER',
    desc: 'Final BUY / HOLD / SELL decision',
    color: '#a855f7',
  },
];

const DEFAULT_TICKERS = [
  'BBCA',
  'BBRI',
  'TLKM',
  'NVDA',
  'AAPL',
  'TSLA',
  'MSFT',
  'META',
  'GOTO',
  'ASII',
];

const TICKER_REFRESH_MS = 2 * 60 * 1000;
const TICKER_CACHE_KEY = 'tradingagents:ticker-quotes:v1';
const TICKER_CACHE_MAX_AGE_MS = 12 * 60 * 60 * 1000;
const TICKER_GROUP_MIN_ITEMS = 24;
const EMPTY_CHANGE = '...';

function fallbackTickerQuotes() {
  return DEFAULT_TICKERS.map((sym) => ({
    sym,
    chg: EMPTY_CHANGE,
    pos: true,
  }));
}

function tickerCacheKey() {
  return `${TICKER_CACHE_KEY}:${DEFAULT_TICKERS.join('|')}`;
}

function readTickerCache() {
  if (typeof window === 'undefined') return null;

  try {
    const cached = JSON.parse(window.localStorage.getItem(tickerCacheKey()) || 'null');
    if (!cached || !Array.isArray(cached.quotes)) return null;
    if (Date.now() - Number(cached.savedAt || 0) > TICKER_CACHE_MAX_AGE_MS) return null;
    return cached.quotes.length > 0 ? cached.quotes : null;
  } catch {
    return null;
  }
}

function writeTickerCache(quotes) {
  if (typeof window === 'undefined' || !Array.isArray(quotes) || quotes.length === 0) return;

  try {
    window.localStorage.setItem(tickerCacheKey(), JSON.stringify({ savedAt: Date.now(), quotes }));
  } catch {
    // Ignore cache failures. The fallback ticker tape still renders immediately.
  }
}

function repeatToMinLength(items, minLength) {
  if (!items.length) return [];

  const repeats = Math.max(1, Math.ceil(minLength / items.length));
  return Array.from({ length: repeats }, () => items).flat();
}

function useTickerQuotes() {
  const [quotes, setQuotes] = useState(() => readTickerCache() || fallbackTickerQuotes());
  const [fetchError, setFetchError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let controller = null;

    async function load() {
      controller?.abort();
      controller = new AbortController();

      try {
        const symbols = DEFAULT_TICKERS.join(',');

        const res = await fetch(
          buildApiUrl(`/market/quotes?symbols=${encodeURIComponent(symbols)}`),
          {
            headers: await buildAuthHeaders(),
            credentials: 'include',
            signal: controller.signal,
          }
        );

        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();

        if (!cancelled) {
          const nextQuotes =
            Array.isArray(data.quotes) && data.quotes.length > 0
              ? data.quotes
              : fallbackTickerQuotes();
          setQuotes(nextQuotes);
          writeTickerCache(nextQuotes);
          setFetchError(false);
        }
      } catch (error) {
        if (error.name === 'AbortError') return;

        if (!cancelled) {
          setFetchError(true);
        }
      }
    }

    load();

    const interval = setInterval(load, TICKER_REFRESH_MS);

    return () => {
      cancelled = true;
      controller?.abort();
      clearInterval(interval);
    };
  }, []);

  return { quotes, fetchError };
}

function TickerTape() {
  const { quotes, fetchError } = useTickerQuotes();
  const items = repeatToMinLength(
    quotes.length > 0 ? quotes : fallbackTickerQuotes(),
    TICKER_GROUP_MIN_ITEMS
  );

  return (
    <div className="border-b border-bloomberg-border bg-black overflow-hidden">
      {fetchError && (
        <div className="font-mono text-xs text-bloomberg-amber text-center py-0.5 bg-bloomberg-surface">
          MARKET DATA UNAVAILABLE - backend offline or yfinance error
        </div>
      )}

      <div className="ticker-tape py-1.5" aria-label="Market ticker tape">
        <div className="ticker-tape__track">
          {[0, 1].map((group) => (
            <div key={group} className="ticker-tape__group" aria-hidden={group === 1}>
              {items.map((t, index) => {
                const isLoading = t.chg === EMPTY_CHANGE;

                return (
                  <span
                    key={`${group}-${t.sym}-${index}`}
                    className="flex items-center gap-2 font-mono text-xs"
                  >
                    <span className="text-bloomberg-white font-semibold tracking-wider">
                      {formatTickerLabel(t.sym)}
                    </span>

                    <span
                      className={
                        isLoading
                          ? 'text-bloomberg-muted'
                          : t.pos
                            ? 'text-bloomberg-green'
                            : 'text-bloomberg-red'
                      }
                    >
                      {isLoading ? EMPTY_CHANGE : t.chg}
                    </span>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentRow({ agent, index, visible }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border-b border-bloomberg-border hover:bg-bloomberg-surface transition-all duration-300 group cursor-default sm:gap-4 sm:p-4 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div
        className="w-10 font-mono text-xs font-bold tracking-wider flex-shrink-0 sm:w-12"
        style={{ color: agent.color }}
      >
        {agent.short}
      </div>

      <div
        className="w-0.5 h-8 flex-shrink-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: agent.color,
          opacity: 0.4,
        }}
      />

      <div className="flex-1 min-w-0">
        <div className="font-mono text-xs font-semibold text-bloomberg-white tracking-wider">
          {agent.label}
        </div>

        <div className="font-mono text-xs text-bloomberg-muted mt-0.5 leading-relaxed">
          {agent.desc}
        </div>
      </div>

      <div className="font-mono text-xs text-bloomberg-border group-hover:text-bloomberg-muted transition-colors">
        {String(index + 1).padStart(2, '0')}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();

  const [visible, setVisible] = useState(false);

  const [status, setStatus] = useState({
    loading: true,
    ok: false,
    error: null,
    toolCacheOk: false,
  });

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function checkBackendStatus() {
      try {
        const response = await fetch(buildApiUrl('/status'), {
          headers: await buildAuthHeaders(),
          credentials: 'include',
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const payload = await response.json();

        setStatus({
          loading: false,
          ok: true,
          error: null,
          toolCacheOk: !payload.tool_cache?.error,
        });
      } catch (error) {
        if (error.name === 'AbortError') {
          return;
        }

        setStatus({
          loading: false,
          ok: false,
          error: error.message || 'Backend unavailable',
          toolCacheOk: false,
        });
      }
    }

    checkBackendStatus();

    return () => controller.abort();
  }, []);

  const systemRows = [
    {
      label: 'AGENT PIPELINE',
      status: status.loading ? 'CHECKING' : status.ok ? 'READY' : 'UNKNOWN',
      tone: status.loading ? 'warn' : status.ok ? 'ok' : 'bad',
    },
    {
      label: 'LLM BACKEND',
      status: status.loading ? 'CHECKING' : status.ok ? 'READY' : 'OFFLINE',
      tone: status.loading ? 'warn' : status.ok ? 'ok' : 'bad',
    },
    {
      label: 'MARKET DATA',
      status: status.loading ? 'CHECKING' : status.toolCacheOk ? 'READY' : 'LIMITED',
      tone: status.loading ? 'warn' : status.toolCacheOk ? 'ok' : 'warn',
    },
    {
      label: 'SSE STREAM',
      status: status.loading ? 'CHECKING' : status.ok ? 'READY' : 'UNKNOWN',
      tone: status.loading ? 'warn' : status.ok ? 'ok' : 'bad',
    },
  ];

  const statusToneClass = {
    ok: 'text-bloomberg-green',
    warn: 'text-bloomberg-amber',
    bad: 'text-bloomberg-red',
  };

  const statusToneMarker = {
    ok: '● ',
    warn: '◐ ',
    bad: '○ ',
  };

  return (
    <div className="min-h-screen bg-bloomberg-bg">
      <Navbar />
      <TickerTape />

      <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="flex flex-col gap-5 lg:col-span-2">
            <div className="border border-bloomberg-border bg-bloomberg-card p-4">
              <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-3">
                System Status
              </div>

              {systemRows.map(({ label, status: rowStatus, tone }) => (
                <div
                  key={label}
                  title={tone === 'bad' ? status.error || 'Backend status check failed' : undefined}
                  className="flex flex-col gap-1 py-1.5 border-b border-bloomberg-border last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-mono text-xs text-bloomberg-muted tracking-wider">
                    {label}
                  </span>

                  <span
                    className={`font-mono text-xs tracking-wider sm:text-right ${statusToneClass[tone]}`}
                  >
                    {statusToneMarker[tone]}
                    {rowStatus}
                  </span>
                </div>
              ))}
            </div>

            <div className="border border-bloomberg-border bg-bloomberg-card p-5">
              <div className="font-mono text-xs text-bloomberg-orange tracking-widest uppercase mb-4">
                Multi-Agent AI Research
              </div>

              <div className="font-display text-3xl font-bold text-bloomberg-white leading-tight tracking-wide mb-3 sm:text-4xl">
                9 AI AGENTS.
                <br />
                ONE DECISION.
              </div>

              <p className="font-mono text-xs text-bloomberg-muted leading-relaxed mb-5">
                Enter a ticker and date. Specialized agents research, debate, assess risk, and
                deliver a structured trade decision with price target and investment thesis.
              </p>

              <button
                onClick={() => navigate(AI_RESEARCH_PATH)}
                className="w-full py-3 bg-bloomberg-orange text-black font-mono text-xs font-bold tracking-widest hover:bg-orange-400 transition-colors duration-150 active:scale-[0.99] mb-3"
              >
                ▶ OPEN TERMINAL
              </button>

              <div className="grid grid-cols-1 gap-2 text-center sm:grid-cols-3">
                {[
                  { val: '9', label: 'AGENTS' },
                  { val: '~3', label: 'MIN' },
                  { val: '5', label: 'OUTPUTS' },
                ].map(({ val, label }) => (
                  <div key={label} className="border border-bloomberg-border p-2">
                    <div className="font-mono text-lg font-bold text-bloomberg-orange">{val}</div>

                    <div className="font-mono text-xs text-bloomberg-muted">{label}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-bloomberg-border bg-bloomberg-card p-4">
              <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-3">
                OUTPUT FIELDS
              </div>

              {[
                {
                  label: 'DECISION',
                  val: 'BUY / HOLD / SELL',
                  color: 'text-bloomberg-orange',
                },
                {
                  label: 'PRICE TARGET',
                  val: 'Numeric target',
                  color: 'text-bloomberg-white',
                },
                {
                  label: 'TIME HORIZON',
                  val: 'e.g. 1–3 months',
                  color: 'text-bloomberg-white',
                },
                {
                  label: 'EXEC SUMMARY',
                  val: '5-sentence brief',
                  color: 'text-bloomberg-white',
                },
                {
                  label: 'THESIS',
                  val: 'Full investment rationale',
                  color: 'text-bloomberg-white',
                },
              ].map(({ label, val, color }) => (
                <div
                  key={label}
                  className="flex flex-col gap-1 py-1.5 border-b border-bloomberg-border last:border-b-0 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="font-mono text-xs text-bloomberg-muted">{label}</span>

                  <span className={`font-mono text-xs ${color} sm:text-right`}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-3">
            <div className="border border-bloomberg-border bg-bloomberg-card">
              <div className="px-4 py-2.5 border-b border-bloomberg-border bg-black flex items-center justify-between">
                <span className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase">
                  Agent Pipeline
                </span>

                <span className="font-mono text-xs text-bloomberg-orange">
                  {AGENTS.length} AGENTS
                </span>
              </div>

              {AGENTS.map((agent, index) => (
                <AgentRow key={agent.short} agent={agent} index={index} visible={visible} />
              ))}

              <div className="px-4 py-3 border-t border-bloomberg-border bg-bloomberg-surface">
                <div className="flex items-center gap-1 overflow-x-auto">
                  {AGENTS.map((agent, index) => (
                    <React.Fragment key={agent.short}>
                      <div
                        className="font-mono text-xs px-2 py-1 border border-bloomberg-border text-bloomberg-muted whitespace-nowrap flex-shrink-0"
                        style={{
                          borderColor: `${agent.color}40`,
                          color: agent.color,
                        }}
                      >
                        {agent.short}
                      </div>

                      {index < AGENTS.length - 1 && (
                        <span className="font-mono text-xs text-bloomberg-border flex-shrink-0">
                          →
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            <div className="border border-bloomberg-border bg-bloomberg-card mt-4 p-4">
              <div className="font-mono text-xs text-bloomberg-muted tracking-wider uppercase mb-3">
                Supported Markets
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    market: 'Indonesia IDX',
                    format: 'BBCA',
                    ex: 'Bank Central Asia',
                  },
                  {
                    market: 'US Markets',
                    format: 'NVDA',
                    ex: 'NVIDIA Corporation',
                  },
                  {
                    market: 'Other',
                    format: 'BARC.L',
                    ex: 'London, Tokyo, etc.',
                  },
                ].map(({ market, format, ex }) => (
                  <div key={market} className="border border-bloomberg-border p-3">
                    <div className="font-mono text-xs text-bloomberg-orange tracking-wider mb-1">
                      {market}
                    </div>

                    <div className="font-mono text-sm font-bold text-bloomberg-white mb-1">
                      {format}
                    </div>

                    <div className="font-mono text-xs text-bloomberg-muted">{ex}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t border-bloomberg-border mt-8 pt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="font-mono text-xs text-bloomberg-border tracking-wider">
            TRADINGAGENTS · POWERED BY TAURICRESEARCH ENGINE · LANGGRAPH ORCHESTRATION
          </span>

          <span className="font-mono text-xs text-bloomberg-border">
            DATA: YFINANCE + ALPHA VANTAGE
          </span>
        </div>
      </div>
    </div>
  );
}
