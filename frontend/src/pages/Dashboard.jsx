import PropTypes from 'prop-types';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import Navbar from '../components/Navbar';
import TickerTape from '../components/TickerTape';
import { AI_AGENT_PATH } from '../constants/routes';
import { buildApiUrl, buildAuthHeaders } from '../utils/api';

const AGENTS = [
  {
    short: 'MKT',
    label: 'MARKET ANALYST',
    desc: 'Price action, volume, technical indicators',
    textClass: 'text-bloomberg-cyan',
    dividerClass: 'bg-bloomberg-cyan/40',
    chipClass: 'border-bloomberg-cyan/25 text-bloomberg-cyan',
    delayClass: '[transition-delay:0ms]',
  },
  {
    short: 'NEWS',
    label: 'NEWS RESEARCHER',
    desc: 'Headlines, sentiment, macro events',
    textClass: 'text-bloomberg-blue',
    dividerClass: 'bg-bloomberg-blue/40',
    chipClass: 'border-bloomberg-blue/25 text-bloomberg-blue',
    delayClass: '[transition-delay:60ms]',
  },
  {
    short: 'FUND',
    label: 'FUNDAMENTALS ANALYST',
    desc: 'Financials, ratios, balance sheet',
    textClass: 'text-[#8b5cf6]',
    dividerClass: 'bg-[#8b5cf6]/40',
    chipClass: 'border-[#8b5cf6]/25 text-[#8b5cf6]',
    delayClass: '[transition-delay:120ms]',
  },
  {
    short: 'BULL',
    label: 'BULL RESEARCHER',
    desc: 'Long-side investment thesis',
    textClass: 'text-bloomberg-green',
    dividerClass: 'bg-bloomberg-green/40',
    chipClass: 'border-bloomberg-green/25 text-bloomberg-green',
    delayClass: '[transition-delay:180ms]',
  },
  {
    short: 'BEAR',
    label: 'BEAR RESEARCHER',
    desc: 'Short-side counterargument',
    textClass: 'text-bloomberg-red',
    dividerClass: 'bg-bloomberg-red/40',
    chipClass: 'border-bloomberg-red/25 text-bloomberg-red',
    delayClass: '[transition-delay:240ms]',
  },
  {
    short: 'RSRCH',
    label: 'RESEARCH MANAGER',
    desc: 'Debate evaluation and synthesis',
    textClass: 'text-bloomberg-amber',
    dividerClass: 'bg-bloomberg-amber/40',
    chipClass: 'border-bloomberg-amber/25 text-bloomberg-amber',
    delayClass: '[transition-delay:300ms]',
  },
  {
    short: 'TRD',
    label: 'TRADER',
    desc: 'Transaction proposal generation',
    textClass: 'text-bloomberg-cyan',
    dividerClass: 'bg-bloomberg-cyan/40',
    chipClass: 'border-bloomberg-cyan/25 text-bloomberg-cyan',
    delayClass: '[transition-delay:360ms]',
  },
  {
    short: 'RISK',
    label: 'RISK ANALYSTS (3×)',
    desc: 'Aggressive / conservative / neutral debate',
    textClass: 'text-bloomberg-orange',
    dividerClass: 'bg-bloomberg-orange/40',
    chipClass: 'border-bloomberg-orange/25 text-bloomberg-orange',
    delayClass: '[transition-delay:420ms]',
  },
  {
    short: 'PORT',
    label: 'PORTFOLIO MANAGER',
    desc: 'Final BUY / HOLD / SELL decision',
    textClass: 'text-[#a855f7]',
    dividerClass: 'bg-[#a855f7]/40',
    chipClass: 'border-[#a855f7]/25 text-[#a855f7]',
    delayClass: '[transition-delay:480ms]',
  },
];

function AgentRow({ agent, index, visible }) {
  return (
    <div
      className={`flex items-center gap-3 p-3 border-b border-bloomberg-border hover:bg-bloomberg-surface transition-all duration-300 group cursor-default sm:gap-4 sm:p-4 ${agent.delayClass} ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
      }`}
    >
      <div
        className={`w-10 font-mono text-xs font-bold tracking-wider flex-shrink-0 sm:w-12 ${agent.textClass}`}
      >
        {agent.short}
      </div>

      <div
        className={`w-0.5 h-8 flex-shrink-0 transition-opacity duration-300 group-hover:opacity-100 ${agent.dividerClass}`}
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

AgentRow.propTypes = {
  agent: PropTypes.shape({
    chipClass: PropTypes.string.isRequired,
    delayClass: PropTypes.string.isRequired,
    desc: PropTypes.string.isRequired,
    dividerClass: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    short: PropTypes.string.isRequired,
    textClass: PropTypes.string.isRequired,
  }).isRequired,
  index: PropTypes.number.isRequired,
  visible: PropTypes.bool.isRequired,
};

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
                Multi-Agent AI Agent
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
                onClick={() => navigate(AI_AGENT_PATH)}
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
                        className={`font-mono text-xs px-2 py-1 border whitespace-nowrap flex-shrink-0 ${agent.chipClass}`}
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
