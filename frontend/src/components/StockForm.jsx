import React, { useState, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const API_KEY = process.env.REACT_APP_API_KEY || '';
const DEFAULT_DEBATE_ROUNDS = clampDebateRounds(process.env.REACT_APP_DEFAULT_MAX_DEBATE_ROUNDS || 3);

const popularTickers = ['BBCA.JK', 'BBRI.JK', 'TLKM.JK', 'BMRI.JK', 'ASII.JK', 'NVDA', 'AAPL'];

function clampDebateRounds(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 3;
  return Math.min(5, Math.max(1, parsed));
}

function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  return headers;
}

function getErrorMessage(payload, fallback = 'Analysis failed.') {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (payload.error?.message) return payload.error.message;
  if (payload.message) return payload.message;
  return fallback;
}

async function readHttpError(res) {
  const text = await res.text();
  try {
    const payload = JSON.parse(text);
    const requestId = payload.request_id ? ` Request ID: ${payload.request_id}` : '';
    return `${getErrorMessage(payload, `Server error ${res.status}.`)}${requestId}`;
  } catch (_) {
    return `Server error ${res.status}: ${text || res.statusText}`;
  }
}

function parseSseBlock(block) {
  const event = { type: 'message', data: [] };

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(':')) continue;

    const idx = line.indexOf(':');
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? '' : line.slice(idx + 1).replace(/^ /, '');

    if (field === 'event') event.type = value;
    if (field === 'data') event.data.push(value);
  }

  if (event.data.length === 0) return null;
  return {
    type: event.type,
    payload: JSON.parse(event.data.join('\n')),
  };
}

export default function StockForm({ onResult, onLoading, onStatus, onAgentProgress }) {
  const [ticker, setTicker]       = useState('NVDA');
  const [date, setDate]           = useState(getTodayDate());
  const [maxRounds, setMaxRounds] = useState(DEFAULT_DEBATE_ROUNDS);
  const [focused, setFocused]     = useState(null);
  const [formError, setFormError] = useState('');
  const [running, setRunning]     = useState(false);
  const abortRef                  = useRef(null);

  function validateForm() {
    const normalizedTicker = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}(?:[.-][A-Z0-9]{1,5})?$/.test(normalizedTicker)) {
      return 'Ticker harus memakai format Yahoo Finance, contoh: BBCA.JK, BBRI.JK, TLKM.JK, AAPL, BRK-B, atau 0700.HK.';
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return 'Trade date harus memakai format YYYY-MM-DD.';
    }
    if (!Number.isInteger(maxRounds) || maxRounds < 1 || maxRounds > 5) {
      return 'Debate rounds harus antara 1 sampai 5.';
    }
    return '';
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      onResult({ error: validationError });
      return;
    }

    setFormError('');
    setRunning(true);
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);
    if (onAgentProgress) onAgentProgress(null);

    try {
      await runStream();
    } catch (err) {
      onResult({ error: err.message || 'Analysis failed.' });
    } finally {
      setRunning(false);
      onLoading(false);
      onStatus('');
      abortRef.current = null;
    }
  }

  async function runStream() {
    const controller = new AbortController();
    abortRef.current = controller;

    const res = await fetch(`${API_URL}/api/analyze/stream`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        ticker: ticker.trim().toUpperCase(),
        trade_date: date,
        max_debate_rounds: maxRounds,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(await readHttpError(res));
    }

    if (!res.body) {
      throw new Error('Browser tidak menerima stream dari backend. Dunia web modern, tetap saja bisa begini.');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        const event = parseSseBlock(block);
        if (!event) continue;

        if (event.type === 'progress') {
          onStatus(event.payload.status_message || 'Agents running...');
          if (onAgentProgress) onAgentProgress(event.payload);
        }

        if (event.type === 'result') {
          onResult(event.payload);
          return;
        }

        if (event.type === 'error') {
          const requestId = event.payload.request_id ? ` Request ID: ${event.payload.request_id}` : '';
          onResult({ error: `${getErrorMessage(event.payload)}${requestId}` });
          return;
        }
      }
    }

    if (buffer.trim()) {
      const event = parseSseBlock(buffer);
      if (event?.type === 'result') onResult(event.payload);
      if (event?.type === 'error') onResult({ error: getErrorMessage(event.payload) });
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

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>Ticker Symbol</label>
        <input
          style={inputBase('ticker')}
          value={ticker}
          onChange={e => setTicker(e.target.value.toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12))}
          onFocus={() => setFocused('ticker')}
          onBlur={() => setFocused(null)}
          placeholder="e.g. BBCA.JK"
          required
          maxLength={12}
          pattern="[A-Z0-9]{1,10}([.-][A-Z0-9]{1,5})?"
        />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {popularTickers.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTicker(t)}
              disabled={running}
              style={{
                background: ticker === t ? 'var(--accent-dim)' : 'var(--bg-card)',
                border: `1px solid ${ticker === t ? 'rgba(0,229,160,0.35)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-sm)',
                padding: '4px 10px',
                fontSize: 11,
                fontFamily: 'var(--font-mono)',
                color: ticker === t ? 'var(--accent)' : 'var(--text-secondary)',
                cursor: running ? 'not-allowed' : 'pointer',
                transition: 'var(--transition)',
                fontWeight: 500,
                opacity: running ? 0.7 : 1,
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
          disabled={running}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <label style={labelStyle}>Debate Rounds</label>
        <select
          style={{ ...inputBase('rounds'), colorScheme: 'dark' }}
          value={maxRounds}
          onChange={e => setMaxRounds(Number(e.target.value))}
          onFocus={() => setFocused('rounds')}
          onBlur={() => setFocused(null)}
          disabled={running}
        >
          {[1, 2, 3, 4, 5].map(n => (
            <option key={n} value={n}>{n} round{n > 1 ? 's' : ''}</option>
          ))}
        </select>
      </div>

      {formError && (
        <p style={{
          margin: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'var(--red)',
          lineHeight: 1.5,
        }}>
          {formError}
        </p>
      )}

      <button
        type="submit"
        disabled={running}
        style={{
          background: 'var(--accent)',
          color: '#070a0f',
          border: 'none',
          padding: '14px 24px',
          borderRadius: 'var(--radius-md)',
          fontSize: 14,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          cursor: running ? 'not-allowed' : 'pointer',
          letterSpacing: '0.03em',
          transition: 'var(--transition)',
          boxShadow: '0 0 24px rgba(0,229,160,0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginTop: 4,
          opacity: running ? 0.7 : 1,
        }}
        onMouseEnter={e => {
          if (running) return;
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
        <span>{running ? 'Running Agent Analysis...' : 'Run Agent Analysis'}</span>
        <span style={{ fontSize: 16 }}>→</span>
      </button>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
        textAlign: 'center',
        letterSpacing: '0.04em',
      }}>
        Analysis can take several minutes, depending on debate rounds and provider speed
      </p>
    </form>
  );
}
