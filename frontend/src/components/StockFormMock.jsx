/**
 * StockFormMock.jsx
 *
 * Testing-only version of StockForm.
 * Uses mockData.js so you can test UI without hitting the real backend.
 * Import this in a test page or replace StockForm temporarily during dev.
 *
 * NEVER import this in production pages (Analysis.jsx etc).
 */
import React, { useState } from 'react';
import {
  MOCK_RESPONSE,
  MOCK_SELL_RESPONSE,
  MOCK_HOLD_RESPONSE,
  MOCK_ERROR_RESPONSE,
} from '../mockData';

const popularTickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL'];

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
  ERROR: MOCK_ERROR_RESPONSE,
};

const MOCK_STEPS = [
  { agent_id: 'market_analyst',    agent_name: 'Market Analyst',       status_message: 'Fetching price data and technical indicators...' },
  { agent_id: 'news_analyst',      agent_name: 'News Researcher',      status_message: 'Scanning recent headlines and macro events...' },
  { agent_id: 'fundamentals',      agent_name: 'Fundamentals Analyst', status_message: 'Pulling financial statements and ratios...' },
  { agent_id: 'bull_researcher',   agent_name: 'Bull Researcher',      status_message: 'Building the bullish investment case...' },
  { agent_id: 'bear_researcher',   agent_name: 'Bear Researcher',      status_message: 'Building the bearish counterarguments...' },
  { agent_id: 'research_manager',  agent_name: 'Research Manager',     status_message: 'Evaluating the debate and forming an investment plan...' },
  { agent_id: 'trader',            agent_name: 'Trader',               status_message: 'Translating the plan into a transaction proposal...' },
  { agent_id: 'risk_analysts',     agent_name: 'Risk Analysts',        status_message: 'Running risk debate: aggressive vs conservative vs neutral...' },
  { agent_id: 'portfolio_manager', agent_name: 'Portfolio Manager',    status_message: 'Synthesizing all inputs into the final decision...' },
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function StockFormMock({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker]   = useState('NVDA');
  const [date, setDate]       = useState(getTodayDate());
  const [focused, setFocused] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);

    try {
      for (const step of MOCK_STEPS) {
        onStatus(step.status_message);
        if (onAgentProgress) onAgentProgress(step);
        await sleep(700);
      }
      const mockData = MOCK_MAP[ticker] || MOCK_RESPONSE;
      onResult(mockData);
    } catch (err) {
      onResult({ error: err.message });
    } finally {
      onLoading(false);
      onStatus('');
    }
  }

  const inputBase = (name) => ({
    background: 'var(--bg-input)',
    border: `1px solid ${focused === name ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--radius-md)',
    padding: '12px 16px',
    color: 'var(--text-primary)',
    fontSize: 14,
    width: '100%',
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    outline: 'none',
    transition: 'var(--transition)',
    boxShadow: focused === name ? '0 0 0 3px var(--accent-dim)' : 'none',
    WebkitAppearance: 'none',
    appearance: 'none',
  });

  const labelStyle = {
    display: 'block',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    color: 'var(--text-muted)',
    marginBottom: 8,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    fontWeight: 500,
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* Mock mode indicator */}
      <div style={{
        background: 'rgba(255,179,64,0.08)',
        border: '1px solid rgba(255,179,64,0.25)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 13 }}>🧪</span>
        <span style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--amber)',
          letterSpacing: '0.06em',
        }}>
          MOCK MODE — NVDA · AAPL · TSLA · ERROR tersedia sebagai contoh
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>Ticker Symbol</label>
        <input
          style={inputBase('ticker')}
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
          onFocus={() => setFocused('ticker')}
          onBlur={() => setFocused(null)}
          placeholder="NVDA / AAPL / TSLA / ERROR"
          required
          maxLength={5}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {[...popularTickers, 'ERROR'].map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTicker(t)}
              style={{
                background: ticker === t ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${ticker === t ? 'rgba(0,229,160,0.35)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: t === 'ERROR'
                  ? 'var(--red)'
                  : ticker === t ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'var(--transition)',
                fontWeight: 500,
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>Trade Date</label>
        <input
          style={{ ...inputBase('date'), colorScheme: 'dark' }}
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          onFocus={() => setFocused('date')}
          onBlur={() => setFocused(null)}
          required
        />
      </div>

      <button
        type="submit"
        style={{
          background: 'var(--amber)',
          color: '#070a0f',
          border: 'none',
          padding: '14px 24px',
          borderRadius: 'var(--radius-md)',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          cursor: 'pointer',
          letterSpacing: '0.03em',
          transition: 'var(--transition)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
        }}
      >
        <span>🧪 Run Mock Analysis</span>
      </button>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}>
        Mock mode: selesai dalam ~7 detik tanpa API call
      </p>
    </form>
  );
}
