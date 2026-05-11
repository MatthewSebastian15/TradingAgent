import React, { useState } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const popularTickers = ['NVDA', 'AAPL', 'TSLA', 'MSFT', 'AMZN', 'META', 'GOOGL'];

function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

export default function StockForm({ onResult, onLoading, onStatus }) {
  const [ticker, setTicker] = useState('NVDA');
  const [date, setDate] = useState(getTodayDate());
  const [focused, setFocused] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    onLoading(true);
    onStatus('Initializing agents...');
    onResult(null);

    try {
      onStatus('Running analysis. This may take 2–3 minutes...');
      const res = await axios.post(`${API_URL}/api/analyze`, {
        ticker,
        trade_date: date,
        max_debate_rounds: 1,
      });
      onResult(res.data);
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

      {/* Ticker */}
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

      {/* Trade Date */}
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

      {/* Submit */}
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
        Analysis typically takes 2–3 minutes to complete
      </p>
    </form>
  );
}