import React, { useState, useRef } from 'react';
import {
  MOCK_RESPONSE,
  MOCK_SELL_RESPONSE,
  MOCK_HOLD_RESPONSE,
  MOCK_ERROR_RESPONSE,
} from '../mockData';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const USE_MOCK = true;

const popularTickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL'];

const MOCK_MAP = {
  NVDA: MOCK_RESPONSE,
  TSLA: MOCK_SELL_RESPONSE,
  AAPL: MOCK_HOLD_RESPONSE,
};

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mock agent steps untuk simulasi progress
const MOCK_STEPS = [
  { agent_name: 'Market Analyst',       status_message: 'Fetching price data and technical indicators...' },
  { agent_name: 'News Researcher',      status_message: 'Scanning recent headlines and macro events...' },
  { agent_name: 'Fundamentals Analyst', status_message: 'Pulling financial statements and ratios...' },
  { agent_name: 'Bull Researcher',      status_message: 'Building the bullish investment case...' },
  { agent_name: 'Bear Researcher',      status_message: 'Building the bearish counterarguments...' },
  { agent_name: 'Research Manager',     status_message: 'Evaluating the debate and forming an investment plan...' },
  { agent_name: 'Trader',               status_message: 'Translating the plan into a transaction proposal...' },
  { agent_name: 'Risk Analysts',        status_message: 'Running risk debate: aggressive vs conservative vs neutral...' },
  { agent_name: 'Portfolio Manager',    status_message: 'Synthesizing all inputs into the final decision...' },
];

export default function StockForm({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker]   = useState('NVDA');
  const [date, setDate]       = useState(getTodayDate());
  const [focused, setFocused] = useState(null);
  const abortRef              = useRef(null);

  async function handleSubmit(e) {
    e.preventDefault();
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);

    try {
      if (USE_MOCK) {
        await runMock();
      } else {
        await runStream();
      }
    } catch (err) {
      onResult({ error: err.message });
    } finally {
      onLoading(false);
      onStatus('');
    }
  }

  // ---- Mock mode ----
  async function runMock() {
    for (const step of MOCK_STEPS) {
      onStatus(step.status_message);
      if (onAgentProgress) onAgentProgress(step);
      await sleep(800);
    }
    const mockData = MOCK_MAP[ticker] || MOCK_RESPONSE;
    onResult(mockData);
  }

  // ---- Real SSE mode ----
  async function runStream() {
    return new Promise((resolve, reject) => {
      // POST to /analyze/stream — backend returns text/event-stream
      // We use fetch + ReadableStream because EventSource only supports GET
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`${API_URL}/api/analyze/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ticker,
          trade_date: date,
          max_debate_rounds: 1,
        }),
        signal: controller.signal,
      })
        .then(async res => {
          if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server error ${res.status}: ${text}`);
          }

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep incomplete last line

            let eventType = null;
            let dataLine = null;

            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventType = line.replace('event:', '').trim();
              } else if (line.startsWith('data:')) {
                dataLine = line.replace('data:', '').trim();
              } else if (line === '' && eventType && dataLine) {
                // Dispatch event
                try {
                  const payload = JSON.parse(dataLine);

                  if (eventType === 'progress') {
                    onStatus(payload.status_message);
                    if (onAgentProgress) onAgentProgress(payload);

                  } else if (eventType === 'result') {
                    onResult(payload);
                    resolve();

                  } else if (eventType === 'error') {
                    onResult({ error: payload.error });
                    resolve();
                  }
                } catch (_) {}

                eventType = null;
                dataLine = null;
              }
            }
          }
          resolve();
        })
        .catch(err => {
          if (err.name === 'AbortError') return resolve();
          reject(err);
        });
    });
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

      {USE_MOCK && (
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
            MOCK MODE — NVDA · AAPL · TSLA tersedia sebagai contoh
          </span>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>Ticker Symbol</label>
        <input
          style={inputBase('ticker')}
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase())}
          onFocus={() => setFocused('ticker')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. NVDA"
          required
          maxLength={8}
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {popularTickers.map(t => (
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
                color: ticker === t ? 'var(--accent)' : 'var(--text-secondary)',
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
        <label style={labelStyle}>
          Trade Date
          <span style={{
            marginLeft: 8,
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            color: 'var(--accent)',
            background: 'var(--accent-dim)',
            padding: '1px 6px',
            borderRadius: 4,
            fontWeight: 400,
            letterSpacing: '0.04em',
          }}>
            default: today
          </span>
        </label>
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
          background: 'var(--accent)',
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
          boxShadow: '0 0 24px rgba(0,229,160,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = '#00ffb3';
          e.currentTarget.style.boxShadow = '0 0 36px rgba(0,229,160,0.45)';
          e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'var(--accent)';
          e.currentTarget.style.boxShadow = '0 0 24px rgba(0,229,160,0.25)';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        <span>Run Agent Analysis</span>
        <span style={{ fontSize: 16 }}>→</span>
      </button>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}>
        {USE_MOCK ? 'Mock mode: selesai dalam ~7 detik' : 'Analysis typically takes 2-3 minutes to complete'}
      </p>
    </form>
  );
}